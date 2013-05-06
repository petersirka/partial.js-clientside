function Framework() {
	this.version = 101;
	this.routes = [];
	this.modules = {};
	this.events = {};
};

Framework.prototype.on = function(name, fn) {

};

Framework.prototype.emit = function(name) {

	var self = this;
	var events = self.events[name] || [];

	if (events.length === 0)
		return self;


	events.forEach(function(fn) {
		fn.call(self)
	});
};

Framework.prototype.route = function(url, fn) {

};


var framework = new Framework();