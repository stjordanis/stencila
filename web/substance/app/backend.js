var oo = require('substance/util/oo');
var $ = require('substance/util/jquery');
var _ = require('substance/util/helpers');
var Stencil = require('../model/Stencil');

var CONFIG = {
  host: 'http://localhost:7373'
};

var Backend = function() {
  this._getAddress();
  // HACK: the doc address is hard-coded
  this.address = "http://localhost:7373/core/stencils/examples/kitchensink"
};

Backend.Prototype = function() {

  // A generic request method
  // -------------------
  //
  // Deals with sending the authentication header, encoding etc.

  this._request = function(method, url, data, cb) {
    var ajaxOpts = {
      type: method,
      url: url,
      contentType: "application/json; charset=UTF-8",
      // dataType: "json",
      success: function(data) {
        cb(null, data);
      },
      error: function(err) {
        console.error(err);
        cb(err.responseText);
      }
    };
    if (data) {
      ajaxOpts.data = JSON.stringify(data);
    }
    $.ajax(ajaxOpts);
  };

  this._getAddress = function() {
    // Address
    this.address = null;
    // ... from <meta> tag
    var address = $('head meta[itemprop=address]');
    if(address.length) this.address = address.attr('content');
    // ... or from url
    if(!this.address) {
      // Remove the leading /
      var path = window.location.pathname.substr(1);
      // Remove the last part of path if it is a title slug
      var lastIndex = path.lastIndexOf('/');
      var last = path.substr(lastIndex);
      if(last.substr(last.length-1)=="-") this.address = path.substr(0,lastIndex);
    }
  };


  // Document
  // ------------------

  // http://10.0.0.12:7373/core/stencils/examples/kitchensink/@content?format=
  this.getDocument = function(documentId, cb) {
    var address = this.address;
    // TODO: we need a concept for generating the document URL
    this._request('GET',  this.address + "@content", null, function(err, resultStr) {
      if (err) { console.error(err); cb(err); }
      var result = JSON.parse(resultStr);
      var doc = new Stencil();
      doc.loadHtml(result.content);
      doc.id = documentId;
      doc.url = address;
      window.doc = doc;
      cb(null, doc);
    });
  };

  // http://10.0.0.12:7373/core/stencils/examples/kitchensink/@save
  // http://10.0.0.12:7373/core/stencils/examples/kitchensink/@render
  this.saveDocument = function(doc, cb) {
    console.warn('Not implement yet.');
    cb(null);
  };

  this.renderDocument = function(doc, cb) {
    doc.__isRendering = true;
    this._request('PUT', this.address + "@render", {
      'format': 'html',
      'content': doc.toHtml()
    }, function(err, resultStr) {
      if (err) {
        doc.__isRendering = false;
        return cb(err);
      }
      var result = JSON.parse(resultStr);
      // creating a new document instance from the returned html
      // In future the server could provide a different format
      // containing only the rendered content as json
      var tmp = new Stencil();
      tmp.loadHtml(result.content);
      _.each(tmp.getNodes(), function(copy, nodeId) {
        if (copy.constructor.static.generatedProps) {
          var node = doc.get(nodeId);
          if (!node) {
            console.warn('Node not present in document', nodeId);
            return;
          }
          node.updateGeneratedProperties(copy);
        }
      });
      doc.__isRendering = false;
    });
  };

  // Figure related
  // ------------------

  this.uploadFigure = function(file, cb) {
    // This is a fake implementation
    var objectURL = window.URL.createObjectURL(file);
    cb(null, objectURL);
  };
};

oo.initClass(Backend);

module.exports = Backend;