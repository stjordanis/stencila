'use strict';

var Discussion = require('./Discussion');
var DiscussionHTMLConverter = require('./DiscussionHTMLConverter');
var DiscussionXMLConverter = require('./DiscussionXMLConverter');
var DiscussionComponent = require('./DiscussionComponent');

module.exports = {
  name: 'discussion',
  configure: function(config) {

    config.addNode(Discussion);
    config.addConverter('html', DiscussionHTMLConverter);
    config.addConverter('xml', DiscussionXMLConverter);
    config.addComponent('discussion', DiscussionComponent);
    config.addIcon('discussion', { 'fontawesome': 'fa-comments' });
    config.addLabel('discussion', {
      en: 'Discussion'
    });
  }
};