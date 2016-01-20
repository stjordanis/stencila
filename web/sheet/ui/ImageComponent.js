'use strict';

var Component = require('substance/ui/Component');
var CellContentComponent = require('./CellContentComponent');
var CellTeaserComponent = require('./CellTeaserComponent');
var $$ = Component.$$;

function ImageComponent() {
  ImageComponent.super.apply(this, arguments);
}

ImageComponent.Prototype = function() {

  this.render = function() {
    var node = this.props.node;
    var el = $$('div').addClass('sc-cell-content sc-object');
    el.addClass(this.props.displayMode);

    // Display cell teaser
    el.append($$(CellTeaserComponent, {node: node}));
    el.append(
      $$('img').attr('src', node.value)
    );
    return el;
  };
};

CellContentComponent.extend(ImageComponent);

module.exports = ImageComponent;
