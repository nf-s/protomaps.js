# 1.13.0
* `PolygonSymbolizer` has `stroke` and `width` for efficient outlines.
* `maxLineChars` line-breaking can be a function.

# 1.12.0
* `Static` takes same basic options as leaflet frontend.

# 1.10.0
* `backgroundColor` option for leaflet or static map.

# 1.9.0
* Center text justification only in the case of `CenterdSymbolizer`
* `TextSymbolizer` `label_props` can be a function
* `LineSymbolizer` `lineJoin` and `lineCap` attributes

# 1.8.0
* add `Padding` generic label symbolizer

# 1.7.0
* `TextSymbolizer` attributes: `lineHeight` in `em`, `letterSpacing` in `px`
* add `linear` and `step` shortcut functions for zoom-based styling

# 1.6.0
* add `removeInspector`

# 1.5.0
* `levelDiff` option to set ratio of display tiles to data tiles.

# 1.4.0
* Feature picking more accurate; uses distance-to-line and point-in-polygon.
* `xray` option to show all layers.

# 1.3.0
* `addInspector` to click on features and show an information popup.

# 1.2.0
* Label symbolizers for point and polygon features take the same set of attributes for text display.
* Add maxLineChars to define line breaking by maximum [code units](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length)

# 1.1.0
PickedFeature in queryFeatures returns object with LayerName and feature.

# 1.0.0

* Most color and numerical Symbolizer attributes can now be treated as evaluated properties, with parameters (zoom:number,feature:Feature)
* `Rule` filters parameters changed from (properties:any) to (zoom:number,feature:Feature) to enable filtering on zoom level and geom_type.
* `Feature.properties` renamed to `Feature.props` for brevity
* Internal `PaintSymbolizer.draw` signature now takes zoom as third parameter.
* `properties` for defining fallbacks for text in label Symbolizers renamed to `label_props` e.g. ["name:en","name"]
