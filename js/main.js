require([
    "configs/uiConfig",
    "app_modules/initUI",
    "app_modules/initApp",

    "esri/map",
    "esri/layers/ArcGISImageServiceLayer", 
    "esri/layers/ImageServiceParameters",

    "esri/graphic",
    "esri/geometry/Point",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/symbols/SimpleLineSymbol",
    "esri/Color",

    "esri/arcgis/Portal", 
    "esri/arcgis/OAuthInfo", 
    "esri/IdentityManager",
    "esri/arcgis/utils",
    "esri/TimeExtent",

    "esri/layers/MosaicRule",
    "esri/layers/DimensionalDefinition",

    "esri/tasks/ImageServiceIdentifyTask",
    "esri/tasks/ImageServiceIdentifyParameters",

    "dojo/on",
    "dojo/dom-class",
    "dojo/_base/connect",
    "dojo/Deferred"
], function (
    uiConfig, initUI, Application,

    Map, ArcGISImageServiceLayer, ImageServiceParameters,
    Graphic, Point, SimpleMarkerSymbol, SimpleLineSymbol, Color,
    arcgisPortal, OAuthInfo, esriId,
    arcgisUtils, TimeExtent,
    MosaicRule, DimensionalDefinition,
    ImageServiceIdentifyTask, ImageServiceIdentifyParameters,

    on, domClass, connect, Deferred
){
    // Enforce strict mode
    'use strict';

    var appConfig = {
        "webMapID": "00052bc317b3403babb8ddf9b64efeab",
        "appID": "T2NYnYffgXujL6DV"
    };

    var app = {};

    signInToArcGISPortal();

    arcgisUtils.createMap(appConfig.webMapID,"mapDiv").then(function(response){

        app.map = response.map;

        app.webMapItems = response.itemInfo.itemData;

        //app.operationalLayersURL contains image layer names and urls that will be used to do identifyTasks
        app.operationalLayersURL = getOperationalLayersURL(app.webMapItems);

        //display chart with soil moisture and snowpack data if app.isWaterStorageChartVisible is true; 
        //otherwise, show chart with precip and evapotranspiration
        app.isWaterStorageChartVisible = false;

        connect.disconnect(response.clickEventHandle);

        app.map.on("update-start", function () {
          domClass.add(document.body, "app-loading");
        });

        app.map.on("update-end", function () {
          domClass.remove(document.body, "app-loading");
        });

        app.map.on("click", getImageLayerDataByLocation);

        
        initializeMapTimeAndZExtent();
    });

    function getImageLayerDataByLocation(event){

        var identifyTaskInputGeometry = event.mapPoint;

        var identifyTaskURLs = getIdentifyTaskURLs(); 

        var lineChartData = [];

        addPointToMAp(identifyTaskInputGeometry);

        executeIdentifyTask(identifyTaskInputGeometry, identifyTaskURLs[0].url, identifyTaskURLs[0].title).then(function(results){
            lineChartData.push(results);

            executeIdentifyTask(identifyTaskInputGeometry, identifyTaskURLs[1].url, identifyTaskURLs[1].title).then(function(results){
                lineChartData.push(results);

                createLineChart(lineChartData);
            });
        });
    }

    function executeIdentifyTask(inputGeometry, identifyTaskURL, imageServiceTitle) {

        var deferred = new Deferred();

        var imageServiceIdentifyTask = new ImageServiceIdentifyTask(identifyTaskURL);
        var imageServiceIdentifyTaskParams = new ImageServiceIdentifyParameters();
            
        imageServiceIdentifyTaskParams.returnCatalogItems = true;
        imageServiceIdentifyTaskParams.returnGeometry = false;

        // Set the geometry to the location of the view click
        imageServiceIdentifyTaskParams.geometry = inputGeometry;

        imageServiceIdentifyTaskParams.timeExtent = getTimeExtent(953121600000, 1481803200000);

        imageServiceIdentifyTaskParams.mosaicRule = getMosaicRule(imageServiceTitle);

        imageServiceIdentifyTask.execute(imageServiceIdentifyTaskParams).then(function(response) {
            // console.log(response);
            var processedResults = processIdentifyTaskResults(response, imageServiceTitle);
            deferred.resolve(processedResults);
        });

        return deferred.promise;
    }

    function processIdentifyTaskResults(results, imageServiceTitle){

        var processedResults = {
            "key": imageServiceTitle,
            "values": []
        };

        if(imageServiceTitle === "Snowpack" || imageServiceTitle === "Evapotranspiration"){
            
            for(var i = 0, len = results.properties.Values.length; i < len; i++){

                var time = results.catalogItems.features[i].attributes.StdTime;
                var value = results.properties.Values[i];

                processedResults.values.push({stdTime: time, value: +value});
            }
        } 
        else if (imageServiceTitle === "Precipitation"){
            // sum rain and snow to get total precipitation of the month
            for(var i = 0, len = results.properties.Values.length; i < len; i++){

                if(!(i % 2)){
                    var time = results.catalogItems.features[i].attributes.StdTime;
                    var value = +results.properties.Values[i] + +results.properties.Values[i + 1];

                    processedResults.values.push({stdTime: time, value: value});
                }
            }
        }
        else if (imageServiceTitle === "Soil Moisture"){
            
        }   

        return processedResults;     
    }

    function getIdentifyTaskURLs(){

        var urls = [];

        for (var i = 0, len = app.operationalLayersURL.length; i < len; i++){

            if(app.isWaterStorageChartVisible){
                if(app.operationalLayersURL[i].title === "Soil Moisture" || app.operationalLayersURL[i].title === "Snowpack") {
                    urls.push(app.operationalLayersURL[i]);
                } 
            } else {
                if(app.operationalLayersURL[i].title === "Precipitation" || app.operationalLayersURL[i].title === "Evapotranspiration") {
                    urls.push(app.operationalLayersURL[i]);
                } 
            }
        }

        return urls;
    }

    // function getMosaicRule(){

    //     var mosaicRule = new MosaicRule();

    //     mosaicRule.method = MosaicRule.METHOD_NONE;

    //     mosaicRule.operation = MosaicRule.OPERATION_SUM;

    //     mosaicRule.multidimensionalDefinition = [];

    //     mosaicRule.multidimensionalDefinition.push(new DimensionalDefinition({
    //         variableName: "",
    //         dimensionName: "StdZ",
    //         values: [[-2, 0]],
    //         isSlice: false
    //     }));

    //     return mosaicRule;
    // }

    function getMosaicRule(imageServiceTitle){

        var mosaicRule = new MosaicRule();

        mosaicRule.method = MosaicRule.METHOD_NONE;

        mosaicRule.operation = MosaicRule.OPERATION_SUM;

        mosaicRule.where = "tag='Actual'"

        return mosaicRule;
    }

    function addPointToMAp(geometry){

        app.map.graphics.clear();

        // Create a symbol for drawing the point
        var markerSymbol = new SimpleMarkerSymbol(
            SimpleMarkerSymbol.STYLE_CIRCLE, 
            12, 
            new SimpleLineSymbol(
                SimpleLineSymbol.STYLE_NULL, 
                new Color([247, 34, 101, 0.9]), 
                1
            ),
            new Color([207, 34, 171, 0.5])
        );

        // Create a graphic and add the geometry and symbol to it
        var pointGraphic = new Graphic(geometry, markerSymbol);

        app.map.graphics.add(pointGraphic);
    }

    function initializeMapTimeAndZExtent(){

        var visibleLayer = getWebMapLayerByVisibility();

        var visibleLayerTimeInfo = getImageLayerTimeInfo(visibleLayer);

        var startTime = convertUnixValueToTime(visibleLayerTimeInfo.timeExtent[0]);

        var endTime = getEndTimeValue(startTime, visibleLayerTimeInfo.defaultTimeInterval, visibleLayerTimeInfo.defaultTimeIntervalUnits);

        setZExtentForImageLayer(visibleLayer);

        updateMapTimeInfo(startTime, endTime);

        console.log(visibleLayerTimeInfo.timeExtent[0], visibleLayerTimeInfo.timeExtent[1]);
    }

    function setZExtentForImageLayer(layer){
        var mr = new MosaicRule({
            "method" : "esriMosaicNone",
            "ascending" : true,
            "operation" : "MT_SUM"
        });
        mr.multidimensionalDefinition = [];
        mr.multidimensionalDefinition.push(new DimensionalDefinition({
            variableName: "",
            dimensionName: "StdZ",
            values: [[-2, 0]]
        }));

        layer.layerObject.setMosaicRule(mr);
    }

    function getWebMapLayerByName(){

    }

    function getWebMapLayerByVisibility(){

        var visibleLayers = app.webMapItems.operationalLayers.filter(function(d){
            return d.visibility === true;
        });

        return visibleLayers[0];
    }

    function getOperationalLayersURL(webMapItems){

        var operationalLayersURL = webMapItems.operationalLayers.map(function(d){
            return {
                "title": d.title,
                "url": d.url
            };
        });

        return operationalLayersURL;
    }

    function getImageLayerTimeInfo(layer){

        var timeInfo = layer.resourceInfo.timeInfo;

        app.timeExtent = timeInfo.timeExtent;

        return timeInfo;
    }

    function updateMapTimeInfo(startTime, endTime){

        var timeExtent = new TimeExtent();
        timeExtent.startTime = startTime;
        timeExtent.endTime = endTime;

        app.map.setTimeExtent(timeExtent);
    }

    function getTimeExtent(startTime, endTime){

        var timeExtent = new TimeExtent();
        timeExtent.startTime = new Date(startTime);
        timeExtent.endTime = new Date(endTime);

        // console.log(timeExtent);

        return timeExtent;
    }

    function getEndTimeValue(startTime, timeInterval, esriTimeUnit){

        var formatedTimeUnit;

        switch(esriTimeUnit){
            case "esriTimeUnitsMonths":
                formatedTimeUnit = "months"
                break;
        }

        timeInterval = timeInterval || 1;
        formatedTimeUnit = formatedTimeUnit || "days";

        return new Date(moment(startTime).add(timeInterval, formatedTimeUnit).format());
    }

    function convertUnixValueToTime(unixValue){
        return new Date(moment(unixValue).format());
    }

    function getClosestValue (num, arr) {
        var curr = arr[0];
        var diff = Math.abs (num - curr);
        for (var val = 0; val < arr.length; val++) {
            var newdiff = Math.abs (num - arr[val]);
            if (newdiff < diff) {
                diff = newdiff;
                curr = arr[val];
            }
        }
        return curr;
    }

    function signInToArcGISPortal(){

        var info = new OAuthInfo({
            appId: appConfig.appID,
            popup: false
        });    
        esriId.registerOAuthInfos([info]);   
        
        new arcgisPortal.Portal(info.portalUrl).signIn()
        .then(function(){
            console.log('you are logged in');
        })     
        .otherwise(
            function (error){
                console.log("Error occurred while signing in: ", error);
            }
        );    
    }

    function createLineChart(data){

        var containerID = ".line-chart-wrapper";

        var container = $(containerID);

        container.empty();


        var timeFormat = d3.time.format("%Y");

        var timeFormatWithMonth = d3.time.format("%Y-%b");

        var uniqueTimeValues = data[0].values.map(function(d){
            return d.stdTime;
        });

        var prevMouseXPosition = 0;

        var currentSelectedTimeValue;

        var getDomainFromData = function(values, key){

            var domain = [];
            var lowest = Number.POSITIVE_INFINITY;
            var highest = Number.NEGATIVE_INFINITY;
            var tmp;

            for (var i = values.length - 1; i >= 0; i--) {
                tmp = +values[i][key];

                if (tmp < lowest) {
                    lowest = +tmp;
                }

                if (tmp > highest) {
                    highest = +tmp;
                }
            }

            domain.push(lowest, Math.ceil(highest));

            console.log("domain for", key, domain);

            return domain;
        }

        // Set the dimensions of the canvas / graph
        var margin = {top: 35, right: 0, bottom: 5, left: 60};
        var width = container.width() - margin.left - margin.right - 5;
        var height = container.height() - margin.top - margin.bottom - 5;

        // Adds the svg canvas
        var svg = d3.select(containerID)
            .append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
            .append("g")
                .attr('class', 'canvas-element')
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var xScale = d3.time.scale()
            .domain(getDomainFromData(data[1].values, "stdTime"))
            .rangeRound([0, width - margin.left]);

        var yScale = d3.scale.linear()
            .domain(getDomainFromData(data[0].values.concat(data[1].values), "value"))
            .range([(height - margin.top), 0]);

        // Define the axes
        var xAxis = d3.svg.axis()
            .scale(xScale)
            .orient("bottom")
            .ticks(15)
            .tickPadding(5)
            .innerTickSize(-(height - margin.top))
            .tickFormat(timeFormat);

        var yAxis = d3.svg.axis()
            .scale(yScale)
            .orient("left")
            .ticks(8)
            .tickPadding(15)
            .innerTickSize(-(width - margin.left));

        // Add the X Axis
        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + (height - margin.top) + ")")
            .call(xAxis);
            
        // Add the Y Axis
        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis);   

        var createLine = d3.svg.line()
            .x(function(d) {
                return xScale(d.stdTime);
            })
            .y(function(d) {
                return yScale(d.value);
            });
            // .interpolate("monotone"); //interpolate the straight lines into curve lines

        //create container for each data group
        var features = svg.selectAll('features')
            .data(data)
            .enter().append('g')
            .attr('class', 'features');
            
        //append the line graphic
        features.append('path')
            .attr('class', 'line')
            .attr('d', function(d){
                return createLine(d.values);
            })
            .attr('stroke', function(d) { 
                return getColorByKey(d.key);
            })
            .attr('stroke-width', 1)
            .attr('fill', 'none');  

        // Define 'div' for tooltips
        var tooltipDiv = d3.select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("display", "none");      

        //drwa the vertical reference line    
        var verticalLine = svg.append('line')
            .attr({
                'x1': 0,
                'y1': 0,
                'x2': 0,
                'y2': height - margin.top
            })
            .style("display", "none")
            .attr("stroke", "#909090")
            .attr('class', 'verticalLine');


        svg.append("rect")
            .attr("class", "overlay")
            .attr("width", width)
            .attr("height", height)
            .on("mouseover", function() { 
                verticalLine.style("display", null); 
                tooltipDiv.style("display", null);
            })
            .on("mouseout", function() { 
                verticalLine.style("display", "none"); 
                tooltipDiv.style("display", "none"); 
            })
            .on("mousemove", mousemove)
            .on('click', function(){
                var startDate = new Date(currentSelectedTimeValue);
                var endDate = getEndTimeValue(currentSelectedTimeValue);
                
                updateMapTimeInfo(startDate, endDate);
            });  

        function mousemove(){

            var mousePositionX = d3.mouse(this)[0];

            var xValueByMousePosition = xScale.invert(mousePositionX).getTime();

            var closestTimeValue = getClosestValue(xValueByMousePosition, uniqueTimeValues);

            var tooltipData = getTooltipDataByTime(closestTimeValue);

            var tooltipContent = '<b>' + timeFormatWithMonth(new Date(closestTimeValue)) + '</b><br>';

            var tooltipX = (mousePositionX > prevMouseXPosition) ? d3.event.pageX - 160 : (d3.event.pageX + 50 < container.width()) ?  d3.event.pageX + 5 : d3.event.pageX - 160;

            // console.log(mousePositionX, container.width());

            d3.select(".verticalLine").attr("transform", function () {
                return "translate(" + xScale(closestTimeValue) + ", 0)";
            });  

            tooltipData.forEach(function(d){
                tooltipContent += '<span style="color:' + getColorByKey(d.key) + '">' +  d.key + ': ' +  d.value+ '</span><br>';
            });    
            
            tooltipDiv.html(tooltipContent)
                .style("left", Math.max(0, tooltipX) + "px")
                .style("top", (d3.event.pageY - 50) + "px");   

            currentSelectedTimeValue = closestTimeValue;
            
            setTimeout(function(){
                prevMouseXPosition = mousePositionX;
            }, 500);
        }

        function getTooltipDataByTime(time){

            var tooltipData = [];
            var selectedItem;

            for(var i = 0, len = data.length; i < len; i++){

                selectedItem = data[i].values.filter(function(d){
                    return d.stdTime === time;
                });

                tooltipData.push({
                    key: data[i].key,
                    value: selectedItem[0].value
                });
            }

            return tooltipData;
        }

        function getColorByKey(key){

            var color;

            switch(key){
                case "Precipitation":
                    color = "#267FD1" 
                    break;
                case "Evapotranspiration":
                    color = "#6D1D0D" 
                    break;
            }

            return color;
        }

    }

});