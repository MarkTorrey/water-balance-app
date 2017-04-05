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
    "dojo/_base/connect"
], function (
    uiConfig, initUI, Application,

    Map, ArcGISImageServiceLayer, ImageServiceParameters,
    Graphic, Point, SimpleMarkerSymbol, SimpleLineSymbol, Color,
    arcgisPortal, OAuthInfo, esriId,
    arcgisUtils, TimeExtent,
    MosaicRule, DimensionalDefinition,
    ImageServiceIdentifyTask, ImageServiceIdentifyParameters,

    on, domClass, connect
){
    // Enforce strict mode
    'use strict';

    var appConfig = {
        "webMapID": "00052bc317b3403babb8ddf9b64efeab",
        "appID": "T2NYnYffgXujL6DV"
    };

    var app = {};

    var imageServiceIdentifyTask;
    var imageServiceIdentifyTaskParams; 

    signInToArcGISPortal();

    arcgisUtils.createMap(appConfig.webMapID,"mapDiv").then(function(response){

        app.map = response.map;

        app.webMapItems = response.itemInfo.itemData;

        connect.disconnect(response.clickEventHandle);

        app.map.on("update-start", function () {
          domClass.add(document.body, "app-loading");
        });

        app.map.on("update-end", function () {
          domClass.remove(document.body, "app-loading");
        });

        app.map.on("click", getImageLayerDataByLocation);
        
        imageServiceIdentifyTask = new ImageServiceIdentifyTask("https://earthobs2.arcgis.com/arcgis/rest/services/GLDAS_SoilMoisture/ImageServer");
        imageServiceIdentifyTaskParams = new ImageServiceIdentifyParameters();
            
        imageServiceIdentifyTaskParams.returnCatalogItems = true;
        imageServiceIdentifyTaskParams.returnGeometry = false;

        initializeMapTimeExtent();
    });

    function getImageLayerDataByLocation(event){

        var identifyTaskInputGeometry = event.mapPoint;

        addPointToMAp(identifyTaskInputGeometry);

        executeIdentifyTask(identifyTaskInputGeometry);
    }

    function executeIdentifyTask(inputGeometry) {

        // Set the geometry to the location of the view click
        imageServiceIdentifyTaskParams.geometry = inputGeometry;

        imageServiceIdentifyTaskParams.timeExtent = getTimeExtent(953121600000, 1481803200000);

        imageServiceIdentifyTaskParams.mosaicRule = getMosaicRule();

        imageServiceIdentifyTask.execute(imageServiceIdentifyTaskParams).then(function(response) {
            console.log(response);
        });
    }

    function getMosaicRule(){

        var mosaicRule = new MosaicRule();

        mosaicRule.method = MosaicRule.METHOD_NONE;

        mosaicRule.operation = MosaicRule.OPERATION_SUM;

        mosaicRule.multidimensionalDefinition = [];

        mosaicRule.multidimensionalDefinition.push(new DimensionalDefinition({
            variableName: "",
            dimensionName: "StdZ",
            values: [[-2, 0]],
            isSlice: false
        }));

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

    function initializeMapTimeExtent(){

        var visibleLayer = getWebMapLayerByVisibility();

        var visibleLayerTimeInfo = getImageLayerTimeInfo(visibleLayer);

        var startTime = convertUnixValueToTime(visibleLayerTimeInfo.timeExtent[0]);

        var endTime = getEndTimeValue(startTime, visibleLayerTimeInfo.defaultTimeInterval, visibleLayerTimeInfo.defaultTimeIntervalUnits);

        setZExtentForImageLayer(visibleLayer);

        updateMapTimeInfo(startTime, endTime);

        console.log(visibleLayer);
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

        // console.log(app.webMapItems.operationalLayers);

        var visibleLayers = app.webMapItems.operationalLayers.filter(function(d){
            return d.visibility === true;
        });

        return visibleLayers[0];
    }

    function getImageLayerTimeInfo(layer){

        var timeInfo = layer.resourceInfo.timeInfo;

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