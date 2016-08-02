var Component = require('substance/ui/Component');
var Tool = require('substance/ui/Tool');
var switchTextType = require('substance/model/transform/switchTextType');
var insertNode = require('substance/model/transform/insertNode');
var deleteNode = require('substance/model/transform/deleteNode');
var uuid = require('substance/util/uuid');
var includes = require('substance/node_modules/lodash/includes');


function BlockToolset() {
  BlockToolset.super.apply(this, arguments);
}

BlockToolset.Prototype = function() {

  var _super = BlockToolset.super.prototype;

  this.render = function($$) {
    var el = $$('div')
      .addClass('sc-toolset sc-block-toolset');

    var selected = this._getSelection();

    // CHECK
    // From a performance perspective is it better to render
    // the entire element even if it is not visible, or do this
    // and just have an empty element?
    if (!selected.type) return el;

    el.addClass('sm-enabled');

    ['heading', 'paragraph', 'list', 'table', 'image', 'blockquote', 'codeblock',
     'execute'].forEach(function(type) {
      var active = selected.type==type;
      var disabled = active || !this._canChange(selected, type);
      el.append(
        $$(BlockTool, {
          name: type,
          disabled: disabled,
          active: active
        })
      );
    }.bind(this));

    return el;
  }

  this._getSelection = function() {
    // CHECK
    // There is more than one way to get the current selection and document, including
    // via `this.context.documentSession`. Is geeting thes via `surface` the best way?
    var surface = this.context.surfaceManager.getFocusedSurface();
    if (!surface) return {};
    var document = surface.getDocument();
    var selection = surface.getSelection();

    var enabled = false;
    var type = null;
    var node = null;
    var level;
    if (selection.isContainerSelection()) {
      // Container selections are selections over
      // multiple blocks, so don't enable
      enabled = false;
    } else if (selection.isNodeSelection() || selection.isPropertySelection()) {
      if (selection.isPropertySelection()) {
        // A selection which is bound to a property (e.g. the content of a paragraph)
        // Only enable if the selection is zero length and at the start of the text
        if (selection.getStartOffset()==0 && selection.getEndOffset()==0) {
          enabled = true;
        }
      } else {
        enabled = true;
      }
      if (enabled) {
        node = document.get(
          selection.getNodeId()
        );
        type = node.type;
        if (type === 'heading') {
          level = node.level;
        }
      }
    }
    return {
      selection: selection,
      type: type,
      node: node
    };
  }

  /**
   * Can the selected node be changed to the specified type
   *
   * @param      {<type>}   selected  The selected
   * @param      {<type>}   type      The type
   * @return     {boolean}  True if able to change, False otherwise.
   */
  this._canChange = function(selected, type) {
    var node = selected.node;
    var schema = this.context.doc.getSchema();
    if (node.isText()) {
      if (schema.isInstanceOf(type, 'text')) {
        // Allow `switchTextType`
        return true;
      }
      else if (node.getText().length == 0) {
        // If empty allow replacement
        return true
      }
    }
    return false;
  }

  /**
   * Change the type of the currently selected
   * node
   *
   * @param      {<type>}  type    The type
   */
  this.changeType = function(type) {
    // CHECK
    // This method is analgous to a `Command.execute` method.
    // Here, instead of having a separate command, we have just integrated it
    // into the component? What is the advantage of having a separate Command?
    var selected = this._getSelection();
    var surface = this.context.surfaceManager.getFocusedSurface();
    var selection = surface.getSelection();
    var schema = surface.getDocument().getSchema();
    surface.transaction(function(tx, args) {
      if (selected.node.isInstanceOf('text') && schema.isInstanceOf(type, 'text')) {
        // Can do a plain `switchTextType`
        args.data = {
          type: type
        };
        return switchTextType(tx, args);
      } else {
        // Do a node replacement
        // This is similar to `substance/model/transform/switchTextType` but does
        // not rquire text nodes and does not transfer annotations.
        var nodeId = selected.node.id;

        // Create the new node
        args.node = {
          type: type,
          source: ''
        }
        var newNode = tx.create(args.node);

        // Hide the old node, show the new node
        var container = tx.get(args.containerId);
        var pos = container.getPosition(nodeId);
        if (pos >= 0) {
          container.hide(nodeId);
          container.show(newNode.id, pos);
        }

        // Delete the old node
        deleteNode(tx, { nodeId: nodeId });

        // Select the new node
        args.selection = tx.createSelection([newNode.id], selection.startOffset, selection.endOffset);
        args.node = newNode;

        return args;
      }
    });
  }

};

Component.extend(BlockToolset);


/**
 * A class of `Tool` which instead of running a command
 * calls the `Blockset.changeType()` method to change the type
 * node
 *
 * @class      BlockTool (name)
 */
function BlockTool() {
  BlockTool.super.apply(this, arguments);
}

BlockTool.Prototype = function() {

  this.performAction = function() {
    this.parent.changeType(this.props.name);
  }

};

Tool.extend(BlockTool);



module.exports = BlockToolset;