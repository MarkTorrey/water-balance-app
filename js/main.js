require([
    "configs/uiConfig",
    "app_modules/initUI",
    "app_modules/initApp",

    "esri/map",
    "esri/layers/ArcGISImageServiceLayer", 
    "esri/layers/ImageServiceParameters",

    "esri/arcgis/Portal", 
    "esri/arcgis/OAuthInfo", 
    "esri/IdentityManager",
    "esri/arcgis/utils",
    "esri/TimeExtent",

    "esri/layers/MosaicRule",
    "esri/layers/DimensionalDefinition",

    "dojo/dom-class",
    "dojo/_base/connect"
], function (
    uiConfig, initUI, Application,

    Map, ArcGISImageServiceLayer, ImageServiceParameters,
    arcgisPortal, OAuthInfo, esriId,
    arcgisUtils, TimeExtent,
    MosaicRule, DimensionalDefinition,

    domClass,
    connect
){
    // var app = new Application();

    var appConfig = {
        "webMapID": "00052bc317b3403babb8ddf9b64efeab",
        "appID": "T2NYnYffgXujL6DV"
    };

    var app = {};

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

          var visibleLayer = getWebMapLayerByVisibility();

          console.log(visibleLayer);
        });

        initializeMapTimeExtent();
    });

    function initializeMapTimeExtent(){

        var visibleLayer = getWebMapLayerByVisibility();

        var visibleLayerTimeInfo = getImageLayerTimeInfo(visibleLayer);

        var startTime = convertUnixValueToTime(visibleLayerTimeInfo.timeExtent[0]);

        var endTime = getEndTimeValue(startTime, visibleLayerTimeInfo.defaultTimeInterval, visibleLayerTimeInfo.defaultTimeIntervalUnits);

        setZExtentForImageLayer(visibleLayer);

        updateMapTimeInfo(startTime, endTime);
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
            values: [-2, 0]
        }));

        layer.mosaicRule = mr;
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

        // console.log(startTime, endTime);

        var timeExtent = new TimeExtent();
        timeExtent.startTime = startTime;
        timeExtent.endTime = endTime;

        console.log(timeExtent);

        app.map.setTimeExtent(timeExtent);
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