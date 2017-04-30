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

    "esri/dijit/Search",
    "esri/request",

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
    Search, esriRequest,
    on, domClass, connect, Deferred
){
    // Enforce strict mode
    'use strict';

    var appConfig = {
        // "webMapID": "00052bc317b3403babb8ddf9b64efeab", //production
        "webMapID": "146d270ef13f400da5eeb04c578fe908", //dev 
        "appID": "T2NYnYffgXujL6DV"
    };

    var app = {};

    // signInToArcGISPortal();

    arcgisUtils.createMap(appConfig.webMapID,"mapDiv").then(function(response){

        app.map = response.map;

        app.webMapItems = response.itemInfo.itemData;

        //app.operationalLayersURL contains image layer names and urls that will be used to do identifyTasks
        app.operationalLayersURL = getOperationalLayersURL(app.webMapItems);

        //display chart with soil moisture and snowpack data if app.isWaterStorageChartVisible is true; 
        //otherwise, show chart with precip and evapotranspiration
        app.isWaterStorageChartVisible = true;

        connect.disconnect(response.clickEventHandle);

        //get the list of StdTime values from the image service's multidimensionalInfo
        getStdTimeInfo().then(function(stdTimeInfo){

            app.stdTimeInfo = stdTimeInfo;

            app.map.on("click", function(event){
                getImageLayerDataByLocation(event.mapPoint);
            });
        });

        setOperationalLayersVisibility();

        initializeMapTimeAndZExtent();

        initSearchWidget();

    });

    $(".month-select").change(trendChartDropdownSelectOnChangeHandler);

    $(".data-layer-select").change(trendChartDropdownSelectOnChangeHandler);

    $(".layer-control-wrapper > div").on("click", function(d){
        
        $(this).addClass("active");
        $(this).siblings().removeClass("active");

        var targetLayer = $(this).attr("target-layer");

        if(targetLayer === "precipitation"){
            app.isWaterStorageChartVisible = false;

            // $('.data-layer-select option').removeAttr('disabled');
            $(".data-layer-select option").removeAttr("selected");

            $(".data-layer-select ").val("Precipitation");

            $('.data-layer-select option[value="Precipitation"]').attr('selected','selected');
            // $('.data-layer-select option[category="waterstorage"]').attr('disabled','disabled');

            

        } else {
            app.isWaterStorageChartVisible = true;

            // $('.data-layer-select option[value="Soil Moisture"]').attr('selected','selected');

            // $(".data-layer-select option:selected").removeAttr("selected");

            // $('.data-layer-select option').removeAttr('disabled');
            $(".data-layer-select option").removeAttr("selected");

            $(".data-layer-select ").val("Soil Moisture");

            $('.data-layer-select option[value="Soil Moisture"]').attr('selected','selected');
            // $('.data-layer-select option[category="waterflux"]').attr('disabled','disabled');
        }

        $('.legend-wrapper').toggleClass("hide");

        if(app.mainChart){
            app.mainChart.toggleChartViews();
        }

        if(app.monthlyTrendChart){
            app.monthlyTrendChart.highlightTrendLineByMonth(app.selectedMonth);
            app.monthlyTrendChart.updateChartScale();
        }

        setOperationalLayersVisibility();
    });

    $(window).resize(function() {
        if(app.mainChart){
            app.mainChart.resize();
        }
    });

    function getStdTimeInfo(url){

        domClass.add(document.body, "app-loading");

        var deferred = new Deferred();

        var layerUrl = app.webMapItems.operationalLayers[0].url;

        var layersRequest = esriRequest({
            url: layerUrl + "/multiDimensionalInfo",
            content: { f: "json" },
            handleAs: "json",
            callbackParamName: "callback"
        });

        layersRequest.then(requestSuccessHandler, requestErrorHandler);

        function requestSuccessHandler(response){

            var stdTime = response.multidimensionalInfo.variables[0].dimensions.filter(function(d){
                return d.name === "StdTime";
            })[0];

            domClass.remove(document.body, "app-loading");

            deferred.resolve(stdTime.values);
        }

        function requestErrorHandler(error){
            console.log("Error: ", error.message);
        }

        return deferred.promise;
    }

    function initSearchWidget(){
        var search = new Search({
            map: app.map,
            autoNavigate: false,
            enableInfoWindow: false,
            enableHighlight: false,
        }, "search");

        search.on('search-results', function(response){
            if(response.results["0"] && response.results["0"][0]){
                getImageLayerDataByLocation(response.results["0"][0].feature.geometry);
            }
        });

        search.startup();
    }

    function getImageLayerDataByLocation(inputGeom){

        var identifyTaskInputGeometry = inputGeom;

        var chartData = [];

        // var identifyTaskURLs = app.operationalLayersURL; 

        var identifyTaskOnSuccessHandler = function(results){

            chartData.push(results);

            if(results.key === "Runoff"){
                app.runoffData = results;
            } 

            if(chartData.length === app.operationalLayersURL.length){

                // console.log(chartData);

                domClass.remove(document.body, "app-loading");

                chartData = chartData.filter(function(d){
                    return d.key !== "Runoff";
                });
            
                toggleBottomPane(true);

                app.monthlyTrendChart = new MonthlyTrendChart(chartData);

                app.mainChart = new MainChart(chartData);

            }
        };

        domClass.add(document.body, "app-loading");

        toggleBottomPane(false);

        addPointToMAp(identifyTaskInputGeometry);

        app.operationalLayersURL.forEach(function(d){

            executeIdentifyTask(identifyTaskInputGeometry, d.url, d.title).then(function(results){
                identifyTaskOnSuccessHandler(results);
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

        // imageServiceIdentifyTaskParams.timeExtent = getTimeExtent(953121600000, 1481803200000);

        imageServiceIdentifyTaskParams.timeExtent = getTimeExtent(1263556800000, 1481803200000);

        imageServiceIdentifyTaskParams.mosaicRule = getMosaicRule(imageServiceTitle);

        imageServiceIdentifyTask.execute(imageServiceIdentifyTaskParams).then(function(response) {
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

        var mergedResults = [];

        var variableName;

        results.catalogItems.features.forEach(function(d, i){

            var values = results.properties.Values[i];

            if(!variableName){
                variableName = d.attributes.Variable;
                mergedResults.push([values]);
            } else {
                if(variableName === d.attributes.Variable){
                    mergedResults[mergedResults.length - 1].push(values);
                } else {
                    mergedResults.push([values]);
                    variableName = d.attributes.Variable;
                }
            }

        });

        mergedResults = mergedResults.map(function(d){

            var joinedValues = d.join(" ");

            var joinedValuesInArray = joinedValues.split(" ");

            return joinedValuesInArray;
        });


        if(mergedResults.length > 1){
            mergedResults.forEach(function(d, i){
                if(i === 0){
                    processedResults.values = d.map(function(item, index){
                        return {
                            "stdTime": app.stdTimeInfo[index],
                            "value": +item
                        };
                    });
                } else {
                    d.forEach(function(item, index){
                        processedResults.values[index].value += +item;
                    });
                }
            });

        } else {
            processedResults.values = mergedResults[0].map(function(item, index){
                return {
                    "stdTime": app.stdTimeInfo[index],
                    "value": +item
                };
            });
        }

        return processedResults;    
    }

    // function getIdentifyTaskURLs(){

    //     var urls = [];

    //     // logic for old services
    //     // for (var i = 0, len = app.operationalLayersURL.length; i < len; i++){

    //     //     if(app.isWaterStorageChartVisible){
    //     //         if(app.operationalLayersURL[i].title === "Soil Moisture" || app.operationalLayersURL[i].title === "Snowpack") {
    //     //             urls.push(app.operationalLayersURL[i]);
    //     //         } 
    //     //     } else {
    //     //         if(app.operationalLayersURL[i].title === "Precipitation" || app.operationalLayersURL[i].title === "Evapotranspiration" || app.operationalLayersURL[i].title === "Runoff") {
    //     //             urls.push(app.operationalLayersURL[i]);
    //     //         } 
    //     //     }
    //     // }


    //     urls.push(app.operationalLayersURL[i]);

    //     return urls;
    // }

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

        // mosaicRule.method = MosaicRule.METHOD_NONE;

        // mosaicRule.operation = MosaicRule.OPERATION_SUM;

        // mosaicRule.where = "tag='Actual'"

        mosaicRule.where = "tag = 'Composite'";

        return mosaicRule;
    }

    function addPointToMAp(geometry){

        app.map.graphics.clear();

        // Create a symbol for drawing the point
        var markerSymbol = new SimpleMarkerSymbol(
            SimpleMarkerSymbol.STYLE_CIRCLE, 
            12, 
            new SimpleLineSymbol(
                SimpleLineSymbol.STYLE_SOLID, 
                new Color([255, 255, 255, 0.7]), 
                2
            ),
            new Color([207, 34, 171, 0.8])
        );

        // Create a graphic and add the geometry and symbol to it
        var pointGraphic = new Graphic(geometry, markerSymbol);

        app.map.graphics.add(pointGraphic);
    }

    function initializeMapTimeAndZExtent(){

        var visibleLayer = getWebMapLayerByVisibility();
        var visibleLayerTimeInfo = getImageLayerTimeInfo(visibleLayer);
        
        var startTime = convertUnixValueToTime(visibleLayerTimeInfo.timeExtent[0]);
        var endTime = getEndTimeValue(visibleLayerTimeInfo.timeExtent[0]);

        setZExtentForImageLayer(visibleLayer);
        updateMapTimeInfo(startTime, endTime);

        // console.log(visibleLayer);
    }

    function setOperationalLayersVisibility(){

        var soilMoistureLayer = app.webMapItems.operationalLayers.filter(function(d){
            return d.layerObject.name === "GLDAS_SoilMoisture"; 
        })[0];

        var precipLayer = app.webMapItems.operationalLayers.filter(function(d){
            return d.layerObject.name === "GLDAS_Precipitation";
        })[0];

        if(app.isWaterStorageChartVisible) {
            soilMoistureLayer.layerObject.show();
            precipLayer.layerObject.hide();
        } else {
            soilMoistureLayer.layerObject.hide();
            precipLayer.layerObject.show();
        }
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
        formatedTimeUnit = formatedTimeUnit || "months";

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

    function toggleBottomPane(isVisible){

        var bottomPane = $(".bottom-pane");

        if(isVisible){
            bottomPane.addClass("visible");
        } else {
            bottomPane.removeClass("visible");
        }
    }

    function trendChartDropdownSelectOnChangeHandler(){

        var selectedMonth = $(".month-select").val();

        app.monthlyTrendChart.highlightTrendLineByMonth(selectedMonth);

        app.monthlyTrendChart.updateChartScale();
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

    function MainChart(data){

        var containerID = ".line-chart-div";

        var container = $(containerID);

        container.empty();

        $("tooltip").remove();

        // console.log(data);

        var timeFormat = d3.time.format("%Y");

        var timeFormatWithMonth = d3.time.format("%b %Y");

        var timeFormatFullMonthName = d3.time.format("%B");

        var uniqueTimeValues = data[0].values.map(function(d){
            return d.stdTime;
        });

        var uniqueYearValues = uniqueTimeValues.map(function(d){
            return timeFormat(new Date(d));
        });

        uniqueYearValues = uniqueYearValues.filter(function(item, pos, self) {
            return self.indexOf(item) == pos;
        });

        var xAxisWidthOffset = 10;

        var prevMouseXPosition = 0;

        var currentTimeValueByMousePosition;

        var highlightTimeValue = uniqueTimeValues[uniqueTimeValues.length-1];

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

            // console.log("domain for", key, domain);

            return domain;
        }

        var precipData = data.filter(function(d){
            return d.key === "Precipitation";
        });

        var evapoData = data.filter(function(d){
            return d.key === "Evapotranspiration";
        });

        var snowpackData = data.filter(function(d){
            return d.key === "Snowpack";
        });

        var soilMoistureData = data.filter(function(d){
            return d.key === "Soil Moisture";
        });

        // Set the dimensions of the canvas / graph
        var margin = {top: 20, right: 10, bottom: 5, left: 35};
        var width = container.width() - margin.left - margin.right;
        var height = container.height() - margin.top - margin.bottom;

        // Adds the svg canvas
        var svg = d3.select(containerID)
            .append("svg")
                .attr('class', 'line-chart-svg')
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
            .append("g")
                .attr('class', 'canvas-element')
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var xScale = d3.time.scale()
            .domain(getDomainFromData(precipData[0].values, "stdTime"))
            .range([0, width - margin.right - xAxisWidthOffset]);

        // var yScale = d3.scale.linear()
        //     .domain(getDomainFromData(precipData[0].values.concat(evapoData[0].values), "value"))
        //     .range([(height - margin.top), 0]);

        var yScale = d3.scale.linear()
            .domain(getDomainFromData(soilMoistureData[0].values.concat(snowpackData[0].values), "value"))
            .range([(height - margin.top), 0]);

        // Define the axes
        var xAxis = d3.svg.axis()
            .scale(xScale)
            .orient("bottom")
            // .ticks(uniqueYearValues.length)
            .tickPadding(5)
            .innerTickSize(-(height - margin.top))
            .tickFormat(timeFormat);

        var yAxis = d3.svg.axis()
            .scale(yScale)
            .orient("left")
            .ticks(7)
            .tickPadding(10)
            .innerTickSize(-(width - margin.right - xAxisWidthOffset));

        // Add the X Axis
        var xAxisG = svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + (height - margin.top) + ")")
            .call(xAxis);
            
        // Add the Y Axis
        var yAxisG = svg.append("g")
            .attr("class", "y axis")
            .call(yAxis);   

        var createLine = d3.svg.line()
            .x(function(d) {
                return xScale(d.stdTime);
            })
            .y(function(d) {
                return yScale(d.value);
            });
            // .interpolate("step-after"); //interpolate the straight lines into curve lines

        var barWidth = Math.floor((width/precipData[0].values.length) * 0.8);

        barWidth = (!barWidth) ? 0.5 : barWidth;

        var bars = svg.selectAll("bar")
            .data(precipData[0].values)
            .enter().append("rect")
            .style("fill", getColorByKey("Precipitation"))
            .style("opacity", 0.7)
            .attr("x", function(d) { 
                // console.log(d);
                return xScale(d.stdTime) - barWidth/2; 
            })
            .attr("width", barWidth)
            .attr("y", function(d) { 
                return yScale(d.value); 
            })
            .attr("height", function(d) { 
                return height - margin.top - yScale(d.value); 
            });

        // console.log("evapoData", evapoData);

        //create container for each data group
        var features = svg.selectAll('features')
            .data(evapoData)
            .enter().append('g')
            .attr('class', 'features');
            
        //append the line graphic
        var lines = features.append('path')
            .attr('class', 'line')
            .attr('d', function(d){
                return createLine(d.values);
            })
            .attr('stroke', function(d) { 
                return getColorByKey(d.key);
            })
            .attr('stroke-width', 2)
            .attr('fill', 'none');  

        
        snowpackData = snowpackData[0].values.map(function(d){
            d.key = "Snowpack";
            return d;
        })

        soilMoistureData = soilMoistureData[0].values.map(function(d){
            d.key = "Soil Moisture";
            return d;
        });

        var areaChartData = soilMoistureData.concat(snowpackData);

        var stack = d3.layout.stack()
            .offset("zero")
            .values(function(d) { return d.values; })
            .x(function(d) { return d.stdTime; })
            .y(function(d) { return d.value; });

        var nest = d3.nest()
            .key(function(d) { return d.key; });

        var areaChartLayers = stack(nest.entries(areaChartData));

        var createArea = d3.svg.area()
            // .interpolate("cardinal")
            .x(function(d) { return xScale(d.stdTime); })
            .y0(function(d) { return yScale(d.y0); })
            .y1(function(d) { return yScale(d.y0 + d.y); });

        var areas = svg.selectAll(".layer")
            .data(areaChartLayers)
            .enter().append("path")
            .attr("class", "layer")
            .attr("d", function(d) { return createArea(d.values); })
            .style("fill", function(d, i) { return getColorByKey(d.key); });

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

        var drag = d3.behavior.drag()
            .on("drag", dragmove)
            .on("dragend", dragend);

        //drwa the vertical reference line    
        var highlightRefLine = svg.append('line')
            .attr({
                'x1': 0,
                'y1': 0,
                'x2': 0,
                'y2': height - margin.top
            })
            .style("display", "none")
            .attr("stroke", "red")
            .attr("stroke-width", "0.5")
            .attr('class', 'highlightRefLine');

        var highlightRefLineLabel = svg.append("g")
            .attr("class", "highlightRefLineLabel")
            .attr("transform", "translate(0, -20)")
            .call(drag);

        var highlightRefLineLabelRect = highlightRefLineLabel.append('rect')
            .attr('width', 60)
            .attr('height', 20)
            .attr("transform", "translate(-30, 0)")
            .attr('class', 'highlightRefLineLabelRect')
            .style('opacity', 0.7)
            .style('fill', 'red');

        var highlightRefLineLabelText =highlightRefLineLabel.append("text")
            .attr('class', 'highlightRefLineLabeltext')
            .attr("dy", "15")
            .attr("text-anchor", "middle")
            // .text("Jan 2010")
            .style('fill', '#fff')
            .style("cursor", 'crosshair');

        var overlay = svg.append("rect")
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
                updateMapAndChartByTime(highlightTimeValue);
            })
            .on("mousemove", mousemove)
            .on('click', function(){
                highlightTimeValue = currentTimeValueByMousePosition;
                updateMapAndChartByTime(highlightTimeValue);
            });  

        function dragmove(d){

            var xPos = d3.event.x;
            var yPos = d3.event.y;

            var xValueByMousePosition = xScale.invert(xPos).getTime();

            var closestTimeValue = getClosestValue(xValueByMousePosition, uniqueTimeValues);

            var xPosByClosestTimeValue = xScale(closestTimeValue);

            highlightTimeValue = closestTimeValue;

            d3.select(".highlightRefLineLabel").attr("transform", function () {
                return "translate(" + xPosByClosestTimeValue + ", -20)";
            }); 

            d3.select(".highlightRefLine").attr("transform", function () {
                return "translate(" + xPosByClosestTimeValue + ", 0)";
            });  

            d3.select(".highlightRefLineLabeltext").text(timeFormatWithMonth(new Date(closestTimeValue)));
        }

        function dragend(d){
            updateMapAndChartByTime(highlightTimeValue);
        }    

        function mousemove(){

            var mousePositionX = d3.mouse(this)[0];

            var xValueByMousePosition = xScale.invert(mousePositionX).getTime();

            var closestTimeValue = getClosestValue(xValueByMousePosition, uniqueTimeValues);

            var tooltipData = getChartDataByTime(closestTimeValue);

            var tooltipContent = '<b>' + timeFormatWithMonth(new Date(closestTimeValue)) + '</b><br>';

            var tooltipX = (mousePositionX > prevMouseXPosition) ? d3.event.pageX - 160 : (d3.event.pageX + 50 < container.width()) ?  d3.event.pageX + 5 : d3.event.pageX - 160;

            currentTimeValueByMousePosition = closestTimeValue;

            d3.select(".verticalLine").attr("transform", function () {
                return "translate(" + xScale(closestTimeValue) + ", 0)";
            });  

            tooltipData = tooltipData.filter(function(d){
                if(app.isWaterStorageChartVisible){
                    return d.key === "Soil Moisture" || d.key === "Snowpack";
                } else {
                    return d.key === "Precipitation" || d.key === "Evapotranspiration";
                }
            });

            tooltipData.sort(function(a, b){
                return b.value - a.value;
            })

            tooltipData.forEach(function(d){
                var textColor = (d.key === "Snowpack") ? "#909090": getColorByKey(d.key);
                tooltipContent += '<span style="color:' + textColor + '">' +  d.key + ': ' +  parseInt(d.value) + '</span><br>';
            });    
            
            tooltipDiv.html(tooltipContent)
                .style("left", Math.max(0, tooltipX) + "px")
                .style("top", (d3.event.pageY - 50) + "px");   

            app.monthlyTrendChart.highlightTrendLineByMonth(timeFormatFullMonthName(new Date(closestTimeValue)));
            
            getPieChartDataByTime(closestTimeValue);

            setTimeout(function(){
                prevMouseXPosition = mousePositionX;
            }, 500);
        }

        function updateMapAndChartByTime(time){
            var startDate = new Date(time);
            var endDate = getEndTimeValue(time);

            app.selectedMonth = timeFormatFullMonthName(startDate);

            updateMapTimeInfo(startDate, endDate);

            app.monthlyTrendChart.highlightTrendLineByMonth(app.selectedMonth);

            setHighlightRefLineByTime(time);
            
            getPieChartDataByTime(time);
        }

        function setHighlightRefLineByTime(time){
            var xPosByTime = xScale(time);

            highlightRefLine.attr("transform", function () {
                return "translate(" + xPosByTime + ", 0)";
            });  

            highlightRefLine.style("display", null); 

            highlightRefLineLabel.attr("transform", function () {
                return "translate(" + xPosByTime + ", -20)";
            });  

            highlightRefLineLabelText.text(timeFormatWithMonth(new Date(time)));
        }

        function getChartDataByTime(time, inputData){

            var chartData = [];
            var selectedItem;

            inputData = inputData || data;

            for(var i = 0, len = inputData.length; i < len; i++){

                selectedItem = inputData[i].values.filter(function(d){
                    return d.stdTime === time;
                });

                chartData.push({
                    key: inputData[i].key,
                    value: selectedItem[0].value
                });
            }

            return chartData;
        }

        function getPieChartDataByTime(time){

            var precipAndEvapoData = getChartDataByTime(time);

            var runoffData = getChartDataByTime(time, [app.runoffData]);

            var precipData = precipAndEvapoData.filter(function(d){
                return d.key === "Precipitation";
            });

            var evapoData = precipAndEvapoData.filter(function(d){
                return d.key === "Evapotranspiration";
            });

            var surfaceChangingStorageData = {
                "key": "Added to Storage",
                "value": precipData[0].value - evapoData[0].value - runoffData[0].value
            };

            var pieChartData = runoffData.concat(evapoData).concat([surfaceChangingStorageData]);

            var formatedTime = timeFormatWithMonth(new Date(time));

            $(".pie-chart-title-text").text("Water Balance - " + formatedTime);

            if(!app.pieChart){
                createPieChart(pieChartData);
            } else {
                updatePieChart(pieChartData);
            }
        }
        
        this.toggleChartViews = function(){

            if(app.isWaterStorageChartVisible){
                yScale.domain([0, d3.max(areaChartData, function(d) { return d.y0 + d.y; })]);
                areas.style("opacity", ".8");
                lines.style("opacity", "0");
                bars.style("opacity", "0");
            } else {
                yScale.domain(getDomainFromData(precipData[0].values.concat(evapoData[0].values), "value"));
                areas.style("opacity", "0");
                lines.style("opacity", ".8");
                bars.style("opacity", ".8");
            }

            yAxisG.transition().duration(1000).ease("sin-in-out")
                .call(yAxis);  

            lines.transition().duration(1000).attr('d', function(d){
                return createLine(d.values);
            });

            areas.transition().duration(1000).attr("d", function(d) { 
                return createArea(d.values); 
            });

            bars.transition().duration(1000)
            .attr("y", function(d) { 
                return yScale(d.value); 
            })
            .attr("height", function(d) { 
                return height - margin.top - yScale(d.value); 
            });
            
        }

        this.resize = function(){
            width = container.width() - margin.left - margin.right - 5;
            height = container.height() - margin.top - margin.bottom - 5;

            // Update the range of the scale with new width/height
            xScale.range([0, width - margin.right - xAxisWidthOffset]);
            yScale.range([height - margin.top, 0]);

            yAxis.innerTickSize(-(width - margin.right - xAxisWidthOffset));

            // // Update the tick marks
            // xAxis.ticks(Math.max(width/75, 2));

            // Update the axis and text with the new scale
            xAxisG.attr("transform", "translate(0," + (height - margin.top) + ")").call(xAxis);
            yAxisG.call(yAxis);

            d3.select(".line-chart-svg").attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom);

            lines.attr('d', function(d){
                return createLine(d.values);
            });

            areas.attr("d", function(d) { 
                return createArea(d.values); 
            });

            barWidth = Math.floor((width/precipData[0].values.length) * 0.8);

            barWidth = (!barWidth) ? 0.5 : barWidth;

            bars.attr("x", function(d) { 
                    return xScale(d.stdTime) - barWidth/2; 
                })
                .attr("width", barWidth)
                .attr("y", function(d) { 
                    return yScale(d.value); 
                })
                .attr("height", function(d) { 
                    return height - margin.top - yScale(d.value); 
                });
            
            overlay.attr("width", width).attr("height", height);

            setHighlightRefLineByTime(highlightTimeValue);

        }

        updateMapAndChartByTime(highlightTimeValue);

        this.toggleChartViews();

    }

    function createPieChart(data){
        
        var containerID = ".pie-chart-div";
        var container = $(containerID);

        // Set the dimensions of the canvas / graph
        var width = container.width();
        var height = container.height();
        var radius = Math.min(width, height) / 2;

        container.empty();
        app.pieChart = new PieChart(containerID, width, height, radius, getPieChartData(data));
    }

    function updatePieChart(data){

        app.pieChart.update(getPieChartData(data));
    }

    function getPieChartData(data){

        var pieChartData = data.filter(function(d){
            return d.value >= 0;
        });

        if(pieChartData.length < 3){
            //the value of surface changing storage is negtive, add a note to pie chart
            var surfaceChangingStorageData = data.filter(function(d){
                return d.key === "Added to Storage";
            });

            $(".pie-chart-footnote-div").html("<span>" + Math.abs(surfaceChangingStorageData[0].value) + "mm lost from storage" + "</span>")
        } else {
            $(".pie-chart-footnote-div").html("");
        }

        return pieChartData;
    }

    function PieChart(chartContainerID, width, height, radius, dataset){
        
        this.width = width;
        this.height = height;
        this.radius = radius;

        var enterAntiClockwise = {
            startAngle: Math.PI * 2,
            endAngle: Math.PI * 2
        };

        var tooltip = d3.select("body").append("div").attr("class", "pie-chart-tooltip");

        var svg = d3.select(chartContainerID).append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("classs", "pie-chart-svg")
            .append("g")
            .attr("transform", "translate(" + this.width / 2 + "," + this.height / 2 + ")");

        var arc = d3.svg.arc()
            .outerRadius(this.radius);

        var pie = d3.layout.pie()
            .sort(null)
            .value(function(d){ return d.value; });
        
        var path = svg.selectAll("path")
            .data(pie([]))
            .enter().append("path")
            .attr("class", "arc")
            .attr("fill", function(d, i) { 
                return getColorByKey(d.data.key); 
            })
            .attr("d", arc)
            .each(function(d) { 
                // store the initial values
                this._current = d; 
            });
        
        this.update = function(data){

            path = path.data(pie(data));

            path.enter().append("path")
                .attr("class", "arc")
                // .attr("fill", function (d, i) {
                //     return d.data.color;
                // })
                .attr("d", arc(enterAntiClockwise))
                .each(function (d) {
                    this._current = {
                        data: d.data,
                        value: d.value,
                        startAngle: enterAntiClockwise.startAngle,
                        endAngle: enterAntiClockwise.endAngle
                    };
                }); // store the initial values

            path.exit()
                .transition()
                .duration(250)
                .attrTween('d', this.arcTweenOut)
                .remove(); // now remove the exiting arcs

            path.transition().duration(250).attrTween("d", this.arcTween); // redraw the arcs
        }

        this.arcTween = function(a) {
            var i = d3.interpolate(this._current, a);
            this._current = i(0);

            d3.select(this)
                .attr("fill", getColorByKey(this._current.data.key))
                .on("mousemove", function(d){
                    tooltip.style("left", d3.event.pageX+10+"px");
                    tooltip.style("top", d3.event.pageY-25+"px");
                    tooltip.style("display", "inline-block");
                    tooltip.html(d.data.key + ": " + d.data.value + " mm");
                })
                .on("mouseover", function(d){

                    d3.selectAll(".arc").each(function(item){
                        var arcElement = d3.select(this).node();
                        if(item.data.key === d.data.key){
                            d3.select(arcElement).style("opacity", 1);
                        } else {
                            d3.select(arcElement).style("opacity", 0.6);
                        }
                    });
                })
                .on("mouseout", function(d){
                    d3.selectAll(".arc").style("opacity", 1);
                    tooltip.style("display", "none");
                });

            return function(t) {
                return arc(i(t));
            };
        }

        this.arcTweenOut = function(a) {
            var i = d3.interpolate(this._current, {startAngle: Math.PI * 2, endAngle: Math.PI * 2, value: 0});
            this._current = i(0);
            return function (t) {
                return arc(i(t));
            };
        }

        this.update(dataset);
    }

    function MonthlyTrendChart(data){

        var getMonthFromTime = d3.time.format("%B");
        var getYearFromTime = d3.time.format("%y");

        var chartData = data.map(function(d){

            d.values.forEach(function(k){
                var stdTime = new Date(k.stdTime);
                k.month = getMonthFromTime(stdTime);
                k.year = getYearFromTime(stdTime);
            });

            var entries = d3.nest()
                .key(function(d){ return d.month; })
                .entries(d.values);

            var annualValues = [];

            entries.forEach(function(i){
                i.dataType = d.key;

                i.values.forEach(function(item, index){
                    if(typeof annualValues[index] === 'undefined'){
                        annualValues[index] = [];
                    }
                    annualValues[index].push(item.value);
                });
            });

            var annualTotalEntry = {
                "dataType": d.key,
                "key": "Annual",
                "values": []
            }

            var annualValuesSum = annualValues.map(function(k){
                var sum = 0;
                k.forEach(function(v){
                    sum += v;
                });
                return sum; 
            });

            annualValuesSum.forEach(function(item, index){
                var year = entries[0].values[index].year;
                var annualValObj =  {
                    "month": "Annual",
                    "value": item,
                    "year": year
                }
                annualTotalEntry.values.push(annualValObj)
            });

            // console.log(entries);

            // console.log(annualTotalEntry);

            entries.push(annualTotalEntry)

            return {
                "key": d.key, 
                "values": entries
            };
        });

        var precipData = data.filter(function(d){
            return d.key === "Precipitation";
        });

        var evapoData = data.filter(function(d){
            return d.key === "Evapotranspiration";
        });

        var soilMoistureData = data.filter(function(d){
            return d.key === "Soil Moisture";
        });

        var snowpackData = data.filter(function(d){
            return d.key === "Snowpack";
        });

        var uniqueYearValues = chartData[0].values[0].values.map(function(d) {
            return d.year;
        });

        var containerID = ".monthly-trend-chart-div";

        var container = $(containerID);

        container.empty();

        // Set the dimensions of the canvas / graph
        var margin = {top: 5, right: 0, bottom: 20, left: 20};
        var width = container.width() - margin.left - margin.right;
        var height = container.height() - margin.top - margin.bottom;

        // Adds the svg canvas
        var svg = d3.select(containerID)
            .append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
            .append("g")
                .attr('class', 'canvas-element-monthly-trend-chart')
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var xScale = d3.scale.ordinal()
            .domain(uniqueYearValues)
            .rangeRoundBands([margin.left, width], 1);

        var yScale = d3.scale.linear()
            .range([height - margin.top, 0])
            .domain(
                [0, d3.max(soilMoistureData[0].values.concat(snowpackData[0].values), function(d) {return d.value;})]
            );  

        var xAxis = d3.svg.axis()
            .innerTickSize(-(height - margin.top))
            .tickPadding(10)
            .scale(xScale)
            .ticks(8)
            .orient("bottom");
            
        var yAxis = d3.svg.axis()
            .scale(yScale)
            .innerTickSize(-(width - margin.left))
            .ticks(6)
            .tickPadding(5)
            .orient("left");
        
        var xAxisG = svg.append("svg:g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + (height - margin.top) + ")")
            .call(xAxis);
            
        var yAxisG = svg.append("svg:g")
            .attr("class", "y axis")
            .attr("transform", "translate(" + (margin.left) + ",0)")
            .call(yAxis);

        var c20 = d3.scale.category20();

        var createLine = d3.svg.line()
            .x(function(d) {
                return xScale(d.year);
            })
            .y(function(d) {
                return yScale(+d.value);
            })
            .interpolate("monotone");

        var precipDataNested = chartData.filter(function(d){
            return d.key === "Precipitation";
        });

        var evapoDataNested = chartData.filter(function(d){
            return d.key === "Evapotranspiration";
        });

        var soilMoistureDataNested = chartData.filter(function(d){
            return d.key === "Soil Moisture";
        });

        var snowpackDataNested = chartData.filter(function(d){
            return d.key === "Snowpack";
        });

        var waterStorageData = snowpackDataNested[0].values.concat(soilMoistureDataNested[0].values);
        var waterFluxData = precipDataNested[0].values.concat(evapoDataNested[0].values);

        //create container for each data group
        var features = svg.selectAll('features')
			.data(waterStorageData.concat(waterFluxData))
            .enter().append('g')
            .attr('class', 'features');
            
        //append the line graphic
        var lines = features.append('path')
            .attr('class', 'monthly-trend-line')
            .attr('d', function(d){
                return createLine(d.values);
            })
            .attr('stroke', function(d, i) { 
                return getColorByKey(d.dataType);
            })
            .style('opacity', "0.2")
            .attr('stroke-width', 1)
            .attr('fill', 'none');  

        this.updateChartScale = function(){
            
            var dataLayerType = $(".data-layer-select").val();
            var monthSelectValue = $(".month-select").val();

            function getYScaleDomainForAnnualTotal(){
                var chartDataByLayerType = chartData.filter(function(d){
                    return d.key === dataLayerType;
                })[0];

                var annualTotalData = chartDataByLayerType.values.filter(function(d){
                    return d.key === "Annual";
                })[0];

                var annualTotalDataMax = d3.max(annualTotalData.values, function(d) {return d.value;});

                return [0, annualTotalDataMax];
            }

            if(dataLayerType === "Precipitation" || dataLayerType === "Evapotranspiration" ){

                if(monthSelectValue !== "Annual"){
                    yScale.domain(
                        [0, d3.max(precipData[0].values.concat(evapoData[0].values), function(d) {return d.value;})]
                    );
                } else {
                    yScale.domain(getYScaleDomainForAnnualTotal());
                }

            } 
            else if(dataLayerType === "Snowpack" || dataLayerType === "Soil Moisture") {

                if(monthSelectValue !== "Annual"){
                    yScale.domain(
                        [0, d3.max(soilMoistureData[0].values.concat(snowpackData[0].values), function(d) {return d.value;})]
                    );
                } else {
                    yScale.domain(getYScaleDomainForAnnualTotal());
                }
            }

            yAxisG.transition().duration(1000).ease("sin-in-out").call(yAxis);  

            lines.transition().duration(1000).attr('d', function(d){
                return createLine(d.values);
            })
        }

        this.highlightTrendLineByMonth = function(month){
            var dataLayerType = $(".data-layer-select").val();

            lines.style("opacity", 0);
            lines.style("stroke-width", 1);

            lines.each(function(d){
                var lineElement = d3.select(this).node();

                if(d.key !== month && d.dataType === dataLayerType){
                    d3.select(lineElement).style("opacity", 0.2);
                    d3.select(lineElement).style("stroke-width", 1);
                }  
                else if(d.key === month && d.dataType === dataLayerType){
                    // console.log("highlight", lineElement);
                    d3.select(lineElement).style("opacity", 1);
                    d3.select(lineElement).style("stroke-width", 3);
                } 

            });

            $(".month-select").val(month);
        }
    }

    // function highlightTrendLineByMonth(month){

    //     // $(".monthly-trend-chart-title-div").html("Trend Analyzer");

    //     var dataLayerType = $(".data-layer-select").val();

    //     d3.selectAll(".monthly-trend-line").style("opacity", 0);
    //     d3.selectAll(".monthly-trend-line").style("stroke-width", 1);

    //     d3.selectAll(".monthly-trend-line").each(function(d){
    //         var lineElement = d3.select(this).node();

    //         if(d.key !== month && d.dataType === dataLayerType){
    //             d3.select(lineElement).style("opacity", 0.2);
    //             d3.select(lineElement).style("stroke-width", 1);
    //         }  
    //         else if(d.key === month && d.dataType === dataLayerType){
    //             // console.log("highlight", lineElement);
    //             d3.select(lineElement).style("opacity", 1);
    //             d3.select(lineElement).style("stroke-width", 3);
    //         } 

    //     });

    //     $(".month-select").val(month);
    // }


    function getColorByKey(key){

        var color;

        switch(key){
            case "Precipitation":
                color = "#476C9B" 
                break;
            case "Evapotranspiration":
                color = "#984447" 
                break;
            case "Runoff":
                color = "#ADD9F4"
                break;
            case "Added to Storage":
                color = "#468C98"
                break;
            case "Snowpack":
                color = "#bcbcbc"
                break;
            case "Soil Moisture":
                color = "#028090"
                break;
        }
        return color;
    }

});
