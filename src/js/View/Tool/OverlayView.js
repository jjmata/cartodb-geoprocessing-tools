'use strict';

App.View.Tool.Overlay = Backbone.View.extend({
  _template: _.template( $('#tool-overlay_template').html() ),

  initialize: function(options) { 
    this._geoVizModel = options.geoVizModel;
    this.model = new Backbone.Model({
      'input': null,
      'overlay': null,
      'name':null
    });
    this.listenTo(this.model,'change',this._updateModelUI);
  },

  events: {
    'click a.cancel': '_cancelTool',
    'click a.run': '_runTool',
    'change [name]' : '_updateModel'
  },

  onClose: function(){
    this.stopListening();
  },

  _cancelTool: function(e){
    e.preventDefault();
    App.events.trigger('tool:close');
  },

  _updateModelUI: function(){

    var m = this.model.toJSON(),
      $run = this.$('.run');
    
    for (var o in m)
      if (!m[o])
        return $run.addClass('disabled');

    return $run.removeClass('disabled');
    
  },

  _updateModel: function(e){
    var $e = $(e.target),
      name = $e.attr('name'),
      value = $.trim($e.val());

    this.model.set(name,value);

  },

  _runTool: function(e){
    e.preventDefault();

    var $run = $(e.target).closest('a');

    if ($run.hasClass('disabled')|| $run.hasClass('running'))
      return;
      
    $run.addClass('running');

    this.run();

  },  

  getOverlayLayers: function(){
    return this._geoVizModel.getSublayers();
  },

  getInputLayers: function(){
    return this._geoVizModel.getSublayers();
  },

  render: function(){

    this.$el.html(this._template({title: this._title}));
    
    // Fill input layer combo
    var inputLayers = this.getInputLayers();
    var $select = this.$('select[name="input"]');
    for (var i in inputLayers){
      $select.append('<option value="' + inputLayers[i].gid + '">' + inputLayers[i].options.layer_name + '</option>');  
    }

    // Fill overlay layers combo
    var overlaylayers = this.getOverlayLayers();

    var $select = this.$('select[name="overlay"]');
    for (var i in overlaylayers){
      $select.append('<option value="' + overlaylayers[i].gid + '">' + overlaylayers[i].options.layer_name + '</option>');  
    }

    return this;
  },

  _getFields: function(attr,cb){
    var _this = this;
    this._geoVizModel.getSublayersFields(this.model.get(attr),function(fields){
      if (!fields)
          throw new Error('Cannot get input layer fields');
        
      // Remove geometry fields. We're building it with the clipping
      fields = _.without(fields,'the_geom_webmercator','the_geom');

      _this._fields[attr] = fields;

      if (_this._fields.input && _this._fields.overlay){
        // Both layer fetches. Do the merge

        if (_this._fields['input'].indexOf('cartodb_id')!= -1 && _this._fields['overlay'].indexOf('cartodb_id')!= -1){
          // CartoDB id is at both layers
          // Let's remove it from the overlay.
          var index = _this._fields['overlay'].indexOf('cartodb_id');
          _this._fields['overlay'].splice(index, 1);
        }

        // Chose a cartodb_id. Input layer takes precendence over overlay
        var common_fields = _.intersection(_this._fields['input'],_this._fields['overlay']);
        var input_fields = _this._fields['input'];
        var overlay_fields = _.difference(_this._fields['overlay'],_this._fields['input']);

        input_fields = _.map(input_fields,function(f){
          return 'a.' + f;
        });

        overlay_fields = _.map(overlay_fields,function(f){
          return 'b.' + f;
        });

        overlay_fields = overlay_fields.concat(_.map(common_fields,function(f){
          return 'b.' + f + ' as ' + f + '_2'
        }));

        //var res = input_fields.concat(overlay_fields);
        var res = input_fields;
        cb(res.join(','));
      }

    });
  },

  mergeFieldsForQuery: function(cb){
    this._fields = {'input' : null, 'left' : null};
    this._getFields('input',cb);
    this._getFields('overlay',cb);
  },

  getFieldsForQuery: function(attr,cb){
    this._geoVizModel.getSublayersFields(this.model.get(attr), function(fields,err){
      if (err)
        throw Error('Cannot get layer fields '+ err);
      
      var prefix = attr=='input' ? 'a.' : 'b.';
      // Remove geometry fields. We're building it with the clipping
      fields = _.without(fields,'the_geom_webmercator','the_geom');
      fields = _.map(fields,function(f){ return prefix + f});

      cb(fields.join(','));
    });
  },

  _getInfoWindowTemplate: function(){
    return '"<div class="cartodb-popup v2"><a href="#close" class="cartodb-popup-close-button close">x</a> <div class="cartodb-popup-content-wrapper"> <div class="cartodb-popup-content"> {{#content.fields}} {{#title}}<h4>{{title}}</h4>{{/title}} {{#value}} <p {{#type}}class="{{ type }}"{{/type}}>{{{ value }}}</p> {{/value}} {{^value}} <p class="empty">null</p> {{/value}} {{/content.fields}} </div> </div> <div class="cartodb-popup-tip-container"></div> </div>"';
  },

  _getInfoWindowFields: function(sqlFields){
    
    var fields = _.map(sqlFields.split(","),function(f){
      var index = f.indexOf('.');
      if (index!=-1)
        return f.substring(index+1);
      else
        return f;
    });

    return _.map(fields,function(f,i){
      return {
        name: f,
        position: i+1,
        title: true
      }
    });

  },

  createLayer: function(){
    var newLayer = JSON.parse(JSON.stringify(this._geoVizModel.findSublayer(this.model.get('input'))));
    newLayer.options.sql = this.model.get('sql');
    newLayer.options.cartocss = "#overlay{ polygon-fill: #FF6600;polygon-opacity: 0.7;line-color: #FFF;line-width: 0.5;line-opacity: 1;}";
    newLayer.options.layer_name = this.model.get('name');
    newLayer.options.geometrytype = this.model.get('geometrytype');
    newLayer.visible = true;

    var ifields = this.model.get('infowindow_fields')
    if (ifields){
      newLayer.infowindow.fields = this._getInfoWindowFields(ifields);
      newLayer.infowindow.template = this._getInfoWindowTemplate();
    }

    this._geoVizModel.addSublayer(newLayer);
    App.events.trigger('tool:close');
  }

});

App.View.Tool.OverlayClip = App.View.Tool.Overlay.extend({
  initialize: function(options) { 
    _.bindAll(this,'_runClip');
    this._title = 'Clip';
    App.View.Tool.Overlay.prototype.initialize.apply(this,[options]);
  },

  run: function(cb){
    this.getFieldsForQuery('input',this._runClip);
  },

  _runClip: function(queryFields){

    var inputlayer = this._geoVizModel.findSublayer(this.model.get('input'));
    var overlaylayer = this._geoVizModel.findSublayer(this.model.get('overlay'));

    this.model.set('geometrytype',Utils.getPostgisMultiType(inputlayer.geometrytype));
    
    // TODO Extract from geometry collections: http://postgis.refractions.net/documentation/manual-2.1SVN/ST_CollectionExtract.html
    var q = [
      " WITH a as ({{{input_query}}}), b as ({{{overlay_query}}}),",
      " r as (",
        "SELECT distinct {{fields}},st_multi(st_intersection(a.the_geom_webmercator,b.the_geom_webmercator)) as the_geom_webmercator",
        " FROM a,b ",
        " WHERE st_intersects(a.the_geom_webmercator,b.the_geom_webmercator)",
      ")",
      " select * from r where st_geometrytype(the_geom_webmercator) ='" + this.model.get('geometrytype') + "'"];

    q = Mustache.render(q.join(' '),{
          input_query: inputlayer.options.sql, 
          overlay_query: overlaylayer.options.sql,
          fields: queryFields
        });

    this.model.set('sql',q);

    this.createLayer();

  },

  getOverlayLayers: function(){
    return this._geoVizModel.getSublayersByGeometryType('polygon');
  }

});

App.View.Tool.OverlayIntersection = App.View.Tool.Overlay.extend({

  initialize: function(options) { 
    _.bindAll(this,'_intersectRun');
    this._title = 'Intersection';
    App.View.Tool.Overlay.prototype.initialize.apply(this,[options]);
  },

  run: function(cb){
    this.mergeFieldsForQuery(this._intersectRun);
  },

  _intersectRun: function(queryFields){
    
    var inputlayer = this._geoVizModel.findSublayer(this.model.get('input'));
    var overlaylayer = this._geoVizModel.findSublayer(this.model.get('overlay'));

    var outputgeomtype = Utils.getPostgisMultiType(inputlayer.geometrytype);

    // TODO Extract from geometry collections: http://postgis.refractions.net/documentation/manual-2.1SVN/ST_CollectionExtract.html
    var q = [
      " WITH a as ({{{input_query}}}), b as ({{{overlay_query}}}),",
      " r as (",
        "SELECT distinct {{fields}},st_multi(st_intersection(a.the_geom_webmercator,b.the_geom_webmercator)) as the_geom_webmercator",
        " FROM a,b ",
        " WHERE st_intersects(a.the_geom_webmercator,b.the_geom_webmercator)",
      ")",
      " select * from r where st_geometrytype(the_geom_webmercator) ='" +  outputgeomtype + "'"];

    q = Mustache.render(q.join(' '),{
          input_query: inputlayer.options.sql, 
          overlay_query: overlaylayer.options.sql,
          fields: queryFields
        });
    
    this.model.set({
      'infowindow_fields': queryFields,
      'sql' : q
    });

    this.createLayer();
  }
});

App.View.Tool.OverlayErase = App.View.Tool.Overlay.extend({
  initialize: function(options) { 
    _.bindAll(this,'_runErase');
    this._title = 'Erase';
    App.View.Tool.Overlay.prototype.initialize.apply(this,[options]);
  },

  run: function(cb){
    this.getFieldsForQuery('input',this._runErase);
  },

  _runErase: function(fields,err){
    if (err)
      throw Error('Cannot get layer fields '+ err);

    var inputlayer = this._geoVizModel.findSublayer(this.model.get('input'));
    var overlaylayer = this._geoVizModel.findSublayer(this.model.get('overlay'));

    var outputgeomtype = Utils.getPostgisMultiType(inputlayer.geometrytype);

    // TODO Extract from geometry collections: http://postgis.refractions.net/documentation/manual-2.1SVN/ST_CollectionExtract.html
    var q = [
      " WITH a as ({{{input_query}}}), b as ({{{overlay_query}}}),",
      " diff as (",
        "SELECT distinct {{fields}},ST_Multi(ST_Difference(a.the_geom_webmercator,b.the_geom_webmercator)) as the_geom_webmercator",
        " FROM a,b ",
        " WHERE st_intersects(a.the_geom_webmercator,b.the_geom_webmercator)",
      "),",
      " nodiff as (",
        "SELECT distinct {{fields}},ST_Multi(a.the_geom_webmercator) as the_geom_webmercator",
        " FROM a,b ",
        " WHERE not st_intersects(a.the_geom_webmercator,b.the_geom_webmercator)",
      ")",
      "SELECT * from diff ",
      "UNION ALL",
      "select * from nodiff",
        "where st_geometrytype(the_geom_webmercator) ='" +  outputgeomtype + "'"];

    q = Mustache.render(q.join(' '),{
          input_query: inputlayer.options.sql, 
          overlay_query: overlaylayer.options.sql,
          fields: fields.join(',')
        });

    this.model.set({
      'sql' : q
    });

    this.createLayer();
  }
});


