require([
    "configs/uiConfig",
    "app_modules/initUI",
    "app_modules/initApp",

    "esri/arcgis/utils",

    "dojo/dom-class",
    "dojo/_base/connect"
], function (
    uiConfig, initUI, Application,
    arcgisUtils,
    domClass,
    connect
){
    // var app = new Application();

    var WEB_MAP_ID = "43fcb73caf2e4dac836ff769aa45619";
    
    var map;

    arcgisUtils.createMap("43fcb73caf2e4dac836ff769aa45619c","mapDiv").then(function(response){

        map = response.map;

        connect.disconnect(response.clickEventHandle);

        map.on("update-start", function () {
          domClass.add(document.body, "app-loading");
        });

        map.on("update-end", function () {
          domClass.remove(document.body, "app-loading");
        });

        map.on("click", function(event){
            console.log(event.mapPoint);
        });
    });
});