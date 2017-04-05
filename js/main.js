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

    // var imageServiceIdentifyTask;
    // var imageServiceIdentifyTaskParams; 

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

        var scatterplotChartData = [];

        addPointToMAp(identifyTaskInputGeometry);

        executeIdentifyTask(identifyTaskInputGeometry, identifyTaskURLs[0].url, identifyTaskURLs[0].title).then(function(results){
            scatterplotChartData.push(results);

            executeIdentifyTask(identifyTaskInputGeometry, identifyTaskURLs[1].url, identifyTaskURLs[1].title).then(function(results){
                scatterplotChartData.push(results);

                console.log(scatterplotChartData);
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
            "title": imageServiceTitle,
            "data": []
        };

        if(imageServiceTitle === "Snowpack" || imageServiceTitle === "Evapotranspiration"){
            
            for(var i = 0, len = results.properties.Values.length; i < len; i++){

                var time = results.catalogItems.features[i].attributes.StdTime;
                var value = results.properties.Values[i];

                processedResults.data.push({stdTime: time, value: +value});
            }
        } 
        else if (imageServiceTitle === "Precipitation"){
            // sum rain and snow to get total precipitation of the month
            for(var i = 0, len = results.properties.Values.length; i < len; i++){

                if(!(i % 2)){
                    var time = results.catalogItems.features[i].attributes.StdTime;
                    var value = +results.properties.Values[i] + +results.properties.Values[i + 1];

                    processedResults.data.push({stdTime: time, value: value});
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

        console.log(timeExtent);

        return timeExtent;
    }

    function getEndTimeValue(startTime, timeInterval, esriTimeUnit){

        var formatedTimeUnit;

        switch(esriTimeUnit){
            case "esriTimeUnitsMonths":
                formatedTimeUnit = "months"
                break;
        }

        return new Date(moment(startTime).add(timeInterval, formatedTimeUnit).format());
    }

    function convertUnixValueToTime(unixValue){
        return new Date(moment(unixValue).format());
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

});