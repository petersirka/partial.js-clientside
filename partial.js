"use strict";

function Framework() {
	this.version = 101;
	this.config = {};
	this.routes = [];
	this.events = {};
	this.global = {};
	this.cache = {};
	this.templates = {};
	this.repository = {};
	this.resources = {};
	this.resources['default'] = {};
	this.locked = {};
	this.url = '';
};

Framework.prototype.on = function(name, fn) {
	var self = this;
	
	var e = self.events[name];

	if (e) {
		e.push(fn);
		return self;
	}

	self.events[name] = [fn];
	return self;
};

Framework.prototype.emit = function(name) {

	var self = this;
	var events = self.events[name] || [];

	if (events.length === 0)
		return self;

	var params = [];
	for (var i = 1; i < arguments.length; i++)
		params.push(arguments[i]);

	events.forEach(function(fn) {
		fn.apply(self, params);
	});
};

Framework.prototype.route = function(url, fn) {
	
	var self = this;
	var priority = url.count('/') + (url.indexOf('*') === -1 ? 0 : 10);
	var route = self._route(url.trim());
	var params = [];

	if (url.indexOf('{') !== -1) {
		route.forEach(function(o, i) {
			if (o.substring(0, 1) === '{')
				params.push(i);
		});
		priority -= params.length;
	}

	self.routes.push({ url: route, fn: fn, priority: priority, params: params });

	self.routes.sort(function(a, b) {
		if (a.priority > b.priority)
			return -1;

		if (a.priority < b.priority)
			return 1;

		return 0;		
	});

	return self;
};

Framework.prototype._route = function(url) {
	url = url.toLowerCase();

	if (url[0] === '/')
		url = url.substring(1);

	if (url[url.length - 1] === '/')
		url = url.substring(0, url.length - 1);

	var arr = url.split('/');
	if (arr.length === 1 && arr[0] === '')
		arr[0] = '/';

	return arr;	
};

Framework.prototype._routeParam = function(routeUrl, route) {
	var arr = [];
	
	if (!route || !routeUrl)
		return arr;

	if (route.params.length === 0)
		return arr;

	route.params.forEach(function(o) {
		var value = routeUrl[o];
		arr.push(value === '/' ? '' : value);
	});

	return arr;
};

Framework.prototype._routeCompare = function(url, route) {
	
	var skip = url.length === 1 && url[0] === '/';

	for (var i = 0; i < url.length; i++) {

		var value = route[i];

		if (typeof(value) === 'undefined')
			return false;

		if (!skip && value[0] === '{')
			continue;

		if (value === '*')
			return true;

		if (url[i] !== value)
			return false;
	}

	return true;
};

Framework.prototype.location = function(url) {

	var self = this;
	var path = self._route(url);
	var routes = [];
	var notfound = true;

	for (var i = 0; i < self.routes.length; i++) {
		var route = self.routes[i];
		if (self._routeCompare(path, route.url)) {
			if (route.url.indexOf('*') === -1)
				notfound = false;
			routes.push(route);
		}
	}

	self.url = url;
	self.repository = {};
	utils.params = null;

	self.emit('location', url);

	routes.forEach(function(route) {
		try
		{
			route.fn.apply(self, self._routeParam(path, route));
		} catch (ex) {
			self.emit('error', ex, url);
		}
	});

	if (notfound)
		self.emit('404', url);
};

Framework.prototype.template = function(name, model) {
	if (name.indexOf('{') !== -1)
		return name.params(model);
	return (this.templates[name] || '').params(model)
};

Framework.prototype.resource = function(name, key) {

	if (typeof(key) === 'undefined') {
		key = name;
		name = 'default';
	}

	var resource = this.resources[name] || {};
	return resource[key] || '';
};

Framework.prototype.post = function(url, data, cb, key) {

	var self = this;

	if (self.locked[url])
		return false;

	var isCache = (typeof(key) !== 'undefined');
	var post = (function() {
		
		self.locked[url] = true;
		self.emit('post', true, url);

		$.post(url, data, function(d) {
			
			delete self.locked[url];
			self.emit('post', false, url, d);

			if (isCache)
				self.cache[key] = d;

			cb(d);
		});
	});

	if (!isCache) {
		post();
		return true;
	}

	var d = self.cache[key] || null;
	if (d === null)
		post();
	else
		cb(d);

	return true;
};

Framework.prototype.get = function(url, cb, key) {

	var self = this;

	if (self.locked[url])
		return false;

	var isCache = (typeof(key) !== 'undefined');
	var get = (function() {

		self.locked[url] = true;
		self.emit('get', true, url);

		$.get(url, function(d) {

			delete self.locked[url];
			self.emit('get', false, url, d);

			if (isCache)
				self.cache[key] = d;

			cb(d);
		});
	});

	if (!isCache) {
		get();
		return self;
	}

	var d = self.cache[key] || null;
	if (d === null)
		get();
	else
		cb(d);

	return self;
};

/*
	Validate
	@model {Object} :: object to validate
	@properties {String array} : what properties?
	@prepare {Function} : return utils.isValid() OR {Boolean} :: true is valid
	@resource {Function} :: function(key) return {String}
	return {ErrorBuilder}
*/
Framework.prototype.validate = function(model, properties, resource, prefix) {
	
	var error = [];
	var self = this;
	
	var prepare = function(name, value) {
		return self.onValidation.call(self, name, value);
	};

	if (typeof(properties) === 'string')
		properties = properties.replace(/\s/g, '').split(',');

	if (typeof(model) === 'undefined' || model === null)
		model = {};

	for (var i = 0; i < properties.length; i++) {
		
		var type = typeof(value);
		var name = properties[i].toString();
		var value = (type === 'function' ? model[name]() : model[name]) || '';

		if (type === 'object') {
			self.validate(value, properties, resource, prefix).forEach(function(err) {
				error.push(err);
			});
			continue;
		};

		var result = prepare(name, value);	

		if (typeof(result) === 'undefined')
			continue;

		type = typeof(result);

		if (type === 'string') {
			error.push({ name: name, error: result });
			continue;
		}

		if (type === 'boolean') {
			if (!result)
				error.push({ name: name, error: self.resource(resource || 'default', (prefix || '') + name) });

			continue;
		}
	};
	
	return error;
};

Framework.prototype.onValidation = null;
Framework.prototype.onPrefix = null;

function Utils() {
	this.params = null;
};

Utils.prototype.GUID = function(max) {

	max = max || 40;

    var rnd = function () {
        return Math.floor(Math.random() * 65536).toString(16);
    };

    var str = '';
    for (var i = 0; i < (max / 4) + 1; i++)
    	str += rnd();

    return str.substring(0, max);
};

Utils.prototype.keys = function(obj) {
  	if (typeof(Object.keys) !== 'undefined')
		return Object.keys(obj);

  	var arr = [];
  
	for (var m in obj)
		arr.push(m);

	return arr;
};

Utils.prototype.eTe = function (el, data) {

    if (data === null)
        return false;

    var isError = data instanceof Array;

    el = $(el);
    if (isError) {
        el.find('> div').remove();
        data.forEach(function (d) {
            el.append('<div>' + (d.error || d.V) + '</div>');
        });
        el.show();
    } else
        el.hide();

    return isError;
};

Utils.prototype.get = function (n) {
    
    var self = this;
    if (self.params === null) {
        var params = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
        self.params = [];
        for (var i = 0; i < params.length; i++) {
            var param = params[i].split('=');
            if (param.length !== 2)
                continue;
            self.params.push({ name: param[0], value: decodeURIComponent(param[1]) });
        }
    }

    var p = self.params.find(function (o) {
        return o.name == n;
    });

    if (p === null)
        return '';

    return p.value || '';
};

Utils.prototype.path = function (s, d) {
    if (typeof (d) === 'undefined')
        d = '/';
    var p = s.substring(s.length - 1, s.length);
    if (p !== d)
        s += d;
    return s;
};

Utils.prototype.url = function (b) {
    var u = window.location.pathname;
    if (typeof (b) === 'undefined')
        b = true;
    return b ? this.path(u) : u;
};

Utils.prototype.fragment = function (max) {
    var arr = utils.url().split('/');
    var builder = [];
    arr.forEach(function (o, index) {
        if (index > max)
            return;
        builder.push(o);
    });
    return utils.path(builder.join('/'));
};

Utils.prototype.JtO = function (d) {
    if (typeof (d) === 'object')
        return d;
    if (d == null || d.length < 2) return null;
    try {
        return $.evalJSON(d);
    } catch (e) {
        return null;
    }
};

Utils.prototype.isChecked = function (o) {
    var obj = $(o);
    if (obj.length === 0)
        return false;
    return obj.get(0).checked;
};

Utils.prototype.isDisabled = function (o) {
    var obj = $(o);
    if (obj.length === 0)
        return false;
    return obj.get(0).disabled;
};

Utils.prototype.disabled = function (o, bool) {
    return $(o).prop({ disabled: bool });
};

Utils.prototype.checked = function (o, bool) {
    return $(o).prop({ checked: bool });
};

Utils.prototype.scroll = function (y, s) {
    $('html,body').animate({ scrollTop: y }, s || 300);
};

Utils.prototype.dateDiff = function (dB, dE) {
    return Math.round((dE - dB) / (1000 * 60 * 60 * 24));
};

Utils.prototype.dateDays = function (y, m) {
    return (32 - new Date(y, m, 32).getDate());
};

Utils.prototype.dateWeek = function (d) {
    var j = new Date(d.getFullYear(), 0, 1);
    var d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.ceil((((d - j) / 86400000) + j.getDay() + 1) / 7) - 1;
};

Utils.prototype.getValue = function (o, isNumber) {
    var obj = $(o);

    if (obj.length === 0)
        return null;

    obj = obj.get(0);

    var m = obj.nodeName.toLowerCase();
    var v = null;

    if (m === 'select-one' || m === 'select') {
        if (obj.length == 0)
            return null;

        v = obj[obj.selectedIndex];
        return isNumber ? v.value.parseInt() : v.value;
    }

    return isNumber ? obj.value.parseInt() : obj.value;
};

Utils.prototype.getText = function (o) {

    var obj = $(o);

    if (obj.length === 0)
        return '';

    obj = obj.get(0);

    if (obj.length === 0)
        return '';

    return obj[obj.selectedIndex].text;
};

Utils.prototype.getIndex = function (o) {
    var obj = $(o);

    if (obj.length === 0)
        return 0;

    obj = obj.get(0);
    return obj.selectedIndex;
};

Utils.prototype.setIndex = function (o, i) {

    var obj = $(o);

    if (obj.length === 0)
        return obj;

    obj = obj.get(0);

    var m = obj.nodeName.toLowerCase();

    if (m === 'select-one' || m === 'select')
        obj.selectedIndex = i;

    return $(obj);
};

Utils.prototype.setProp = function (o, v) {
    var el = $(o);
    if (el.length == 0)
        return el;

    return $(o).attr('itemprop', v);
};

Utils.prototype.getProp = function (o, isNumber) {
    var el = $(o);
    if (el.length == 0)
        return el;

    var v = el.attr('itemprop');
    if (isNumber)
        return v.parseInt();

    return v;
};

Utils.prototype.setValue = function (o, v) {
    var obj = $(o);

    if (obj.length === 0)
        return el;

    if (v === null)
        return el;

    var el = obj;
    obj = obj.get(0);

    var m = obj.nodeName.toLowerCase();
    if (m === 'select-one' || m === 'select') {
        var l = obj.length;
        for (var i = 0; i < l; i++) {
            if (obj[i].value == v) {
                obj[i].selected = true;
                return el;
            }
        }

        return el;
    }

    var type = obj.type.toString().toLowerCase();
    if (type === 'checkbox' || type === 'radio')
        obj.checked = v;
    else
        obj.value = v;

    return el;
};

Utils.prototype.setValues = function (f, h) {

    f = $(f);

    if (f.length === 0)
        return f;

    var obj = f;
    f = f.get(0);

    if (f.nodeName.toLowerCase() === 'form') {
        for (var i = 0; i < f.length; i++) {
            var el = f[i];
            h.call(el, el, i);
        }
        return obj;
    }

    var index = 0;
    
    $(f).find('input,select,textarea').each(function () {
        h.call(this, this, index++);
    });

    return obj;
};

Utils.prototype.optionClear = function (o) {

    var obj = $(o);
    if (obj.length === 0)
        return obj;

    obj.get(0).length = 0;
    return obj;
};

Utils.prototype.optionCreate = function (el, text, value, callback) {
    var obj = $(el);
    if (obj.length === 0)
        return obj;

    var option = document.createElement('OPTION');
    option.text = text;
    option.value = value;
    callback && callback.call(option, option);
    obj.get(0).options.add(option);

    return obj;
};

Utils.prototype.cookie = {
    read: function (name) {
        var arr = document.cookie.split(';');
        for (var i = 0; i < arr.length; i++) {
            var c = arr[i];
            if (c.charAt(0) === ' ')
                c = c.substring(1);
            var v = c.split('=');
            if (v.length > 1) {
                if (v[0] == name)
                    return v[1];
            }
        }
        return '';
    },

    write: function (name, value, expire) {
        var expires = '';
        var cookie = '';
        if (typeof (expire) === 'number') {
            var date = new Date();
            date.setTime(date.getTime() + (expire * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toGMTString();
        } else if (expire instanceof Date) {
            expires = '; expires=' + expire.toGMTString();
        }
        document.cookie = name + '=' + value + expires + '; path=/';
    },

    remove: function (name) {
        this.write(name, '', -1);
    }
};

Utils.prototype.confirm = function (b, message) {

    if (!b) {
        window.onbeforeunload = null;
        return this;
    }

    if (window.onbeforeunload != null)
        return;

    window.onbeforeunload = function (e) {
        e = e || window.event;

        if (e)
            e.returnValue = message;

        return message;
    };
};

Utils.prototype.opacity = function (v, h) {
    var el = $('#opacity');
    var self = this;

    if (el.length == 0) {
        $(document.body).append('<div id="opacity"></div>');
        el = $('#opacity');
    }

    if (v) {
        el.show();
        self.emit('opacity', true);
    }
    else {
        el.hide();
        self.emit('opacity', false);
    }

    h && h(el, v);
    return el;
};

Utils.prototype.share = {
    facebook: function (url, title) {
        url = url || window.location.href;
        title = title || document.title;
        window.location.href = 'http://www.facebook.com/sharer.php?u=' + encodeURIComponent(url) + '&t=' + encodeURIComponent(title);
    },
    twitter: function (url, title) {
        url = url || window.location.href;
        title = title || document.title;
        window.location.href = 'http://twitter.com/share?url=' + encodeURIComponent(url) + '&via=' + encodeURIComponent(title);
    },
    google: function (url) {
        url = url || window.location.href;
        window.location.href = 'https://plus.google.com/share?url=' + encodeURIComponent(url);
    }
};

Utils.prototype.pluralize = function (i, a, b, c) {
    if (i === 1)
        return b;

    if (i > 1 && i < 5)
        return c;

    return a;
};

Utils.prototype.init = {
    facebook: function (lang, appId) {
        lang = lang || 'sk_SK';
        appId = appId || '346088855483095';
        (function (d, s, id) {
            var js, fjs = d.getElementsByTagName(s)[0];
            if (d.getElementById(id)) return;
            js = d.createElement(s); js.id = id;
            js.src = '//connect.facebook.net/' + lang + '/all.js#xfbml=1&appId=' + appId;
            fjs.parentNode.insertBefore(js, fjs);
        }(document, 'script', 'facebook-jssdk'));
    },
    google: function () {
        (function () {
            var po = document.createElement('script'); po.type = 'text/javascript'; po.async = true;
            po.src = 'https://apis.google.com/js/plusone.js';
            var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(po, s);
        })();
    },
    twitter: function () {
        (function () {
            var po = document.createElement('script'); po.type = 'text/javascript'; po.async = true;
            po.src = 'http://platform.twitter.com/widgets.js';
            var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(po, s);
        })();
    }
};

/*
	Async class
*/
function Async() {
	this.onComplete = null;
	this.count = 0;
	this.pending = {};
	this.waiting = {};
	this.isRunning = false;
	this.events = {};
};

Async.prototype.on = function(name, fn) {
	var self = this;
	
	var e = self.events[name];

	if (e) {
		e.push(fn);
		return self;
	}

	self.events[name] = [fn];
	return self;
};

Async.prototype.emit = function(name) {

	var self = this;
	var events = self.events[name] || [];

	if (events.length === 0)
		return self;

	var params = [];
	for (var i = 1; i < arguments.length; i++)
		params.push(arguments[i]);

	events.forEach(function(fn) {
		fn.apply(self, params);
	});
};

/*
	Internal function
	@name {String}
	@waiting {Boolean}
	return {Async}
*/
Async.prototype._complete = function(name, waiting) {
	var self = this;

	if (!waiting) {
		
		if (typeof(self.pending[name]) === 'undefined')
			return self;
		
		delete self.pending[name];
	}

	if (self.count > 0)
		self.count--;

	self.emit('end', name);

	if (self.count === 0) {
		self.onComplete && self.onComplete();
		self.emit('complete');
	}

	if (typeof(self.waiting[name]) !== 'undefined') {

		var fn = self.waiting[name];
		delete self.waiting[name];

		fn.forEach(function(f) {
			f();
		});
	}

	return self;
};

/*
	Add function to async list
	@name {String}
	@fn {Function}
	return {Async}
*/
Async.prototype.await = function(name, fn) {
	var self = this;
	self.count++;

	if (typeof(name) === 'function') {
		fn = name;
		name = utils.GUID(10);
	}

	self.pending[name] = function() {
		fn(function() {
			self._complete(name);
		});
	};

	if (self.isRunning)
		self.pending[name]();

	return self;
};

/*
	Add function to async wait list
	@name {String}
	@waitingFor {String} :: name of async function
	@fn {Function}
	return {Async}
*/
Async.prototype.wait = function(name, waitingFor, fn) {

	var self = this;
	self.count++;

	if (typeof(waitingFor) === 'function') {
		fn = waitingFor;
		waitingFor = name;
		name = utils.GUID(5);
	}

	if (typeof(self.waiting[waitingFor]) === 'undefined')
		self.waiting[waitingFor] = [];

	var run = function() {
		self.emit('begin', name);

		fn(function() {
			self._complete(name, true);
		});
	};

	self.waiting[waitingFor].push(run);
	return self;
};

/*
	Run async functions
	@fn {Function} :: callback
	return {Async}
*/
Async.prototype.complete = function(fn) {
	
	var self = this;
	self.onComplete = fn;
	self.isRunning = true;
	
	utils.keys(self.pending).forEach(function(name) {
		self.emit('begin', name);
		self.pending[name]();
	});

	return self;
};

// ========================================================================
// GLOBAL PROTOTYPES
// ========================================================================

// shim layer with setTimeout fallback from http://paulirish.com/2011/requestanimationframe-for-smart-animating/
window.requestAnimFrame = (function () {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function (callback, element) { window.setTimeout(callback, 1000 / 60); };
})();

/*
    @type {String}
    @value {Number}
    return {Date}
*/
Date.prototype.add = function (type, value) {
    var self = this;
    switch (type) {
        case 's':
        case 'ss':
        case 'second':
        case 'seconds':
            self.setSeconds(self.getSeconds() + value);
            return self;
        case 'm':
        case 'mm':
        case 'minute':
        case 'minutes':
            self.setMinutes(self.getMinutes() + value);
            return self;
        case 'h':
        case 'hh':
        case 'hour':
        case 'hours':
            self.setHours(self.getHours() + value);
            return self;
        case 'd':
        case 'dd':
        case 'day':
        case 'days':
            self.setDate(self.getDate() + value);
            return self;
        case 'M':
        case 'MM':
        case 'month':
        case 'months':
            self.setMonth(self.getMonth() + value);
            return self;
        case 'y':
        case 'yyyy':
        case 'year':
        case 'years':
            self.setFullYear(self.getFullYear() + value);
            return self;
    }
    return self;
};

/*
    Format date to string
    @format {String}
    return {String}
*/
Date.prototype.format = function (format) {
    var self = this;

    var h = self.getHours();
    var m = self.getMinutes().toString();
    var s = self.getSeconds().toString();
    var M = (self.getMonth() + 1).toString();
    var yyyy = self.getFullYear().toString();
    var d = self.getDate().toString();

    var a = 'AM';
    var H = h.toString();

    if (h >= 12) {
        h -= 12;
        a = 'PM';
    }

    if (h === 0)
        h = 12;

    h = h.toString();

    var hh = h.padLeft(2);
    var HH = H.padLeft(2);
    var mm = m.padLeft(2);
    var ss = s.padLeft(2);
    var MM = M.padLeft(2);
    var dd = d.padLeft(2);
    var yy = yyyy.substring(2);

    return format.replace(/yyyy/g, yyyy).replace(/yy/g, yy).replace(/MM/g, MM).replace(/M/g, M).replace(/dd/g, dd).replace(/d/g, d).replace(/HH/g, HH).replace(/H/g, H).replace(/hh/g, hh).replace(/h/g, h).replace(/mm/g, mm).replace(/m/g, m).replace(/ss/g, ss).replace(/s/g, ss).replace(/a/g, a);
};

String.prototype.parseDate = function () {

    var str = this.toString();

    if (str[0] === '/' && str[str.length - 1] === '/')
        return new Date(parseInt(str.substr(6)));

    var arr = this.split(' ');
    var date = arr[0].split('-');
    var time = arr[1].split(':');
    return new Date(parseInt(date[0] || 0), parseInt(date[1] || 0), parseInt(date[2] || 0), parseInt(time[0] || 0), parseInt(time[1] || 0), parseInt(time[2] || 0));
};

String.prototype.trim = function () {
    return this.replace(/^[\s]+|[\s]+$/g, '');
};

/*
	Count text in string
	@text {String}
	return {Number}
*/
String.prototype.count = function(text) {
    var index = 0;
    var count = 0;
    do {
        
        index = this.indexOf(text, index + text.length);

        if (index > 0)
            count++;

    } while (index > 0);
    return count;
};

/*
    @arguments {Object array}
    return {String}
*/
String.prototype.format = function () {
    var formatted = this;
    for (var i = 0; i < arguments.length; i++) {
        var regexp = new RegExp('\\{' + i + '\\}', 'gi');
        formatted = formatted.replace(regexp, arguments[i]);
    }
    return formatted;
};

String.prototype.htmlEncode = function () {
    return this.replace(/\>/g, '&gt;').replace(/\</g, '&lt;').replace(/\"/g, '&quot');
};

String.prototype.htmlDecode = function () {
    return this.replace(/&gt;/g, '>').replace(/\&lt;/g, '<').replace(/\&quot;/g, '"');
};

/*
    Simple templating :: Hello {name}, your score: {score}, your price: {price | ### ###.##}, date: {date | dd.MM.yyyy}
    @obj {Object}
    return {String}
*/
String.prototype.params = function (obj) {
    var formatted = this.toString();

    if (typeof (obj) === 'undefined' || obj === null)
        return formatted;

    var reg = /\{[^}\n]*\}/g;

    formatted.match(reg).forEach(function (prop) {

        var isEncode = false;
        var name = prop.substring(1, prop.length - 1).trim();

        var format = '';
        var index = name.indexOf('|');

        if (index !== -1) {
            format = name.substring(index + 1, name.length).trim();
            name = name.substring(0, index).trim();
        }

        if (prop.substring(0, 2) === '{!') {
            name = name.substring(1);
        } else
            isEncode = true;

        var val;

        if (name.indexOf('.') !== -1) {
            var arr = name.split('.');

            if (arr.length === 2)
                val = obj[arr[0]][arr[1]];
            else if (arr.length === 3)
                val = obj[arr[0]][arr[1]][arr[3]];
            else if (arr.length === 4)
                val = obj[arr[0]][arr[1]][arr[3]][arr[4]];
            else if (arr.length === 5)
                val = obj[arr[0]][arr[1]][arr[3]][arr[4]][arr[5]];
        } else {
            val = name.length === 0 ? obj : obj[name];
        }

        if (typeof (val) === 'function')
            val = val(index);

        if (typeof (val) === 'undefined')
            return;

        if (format.length > 0) {

            var type = typeof (val);
            if (type === 'string') {
                var max = parseInt(format);
                if (!isNaN(max))
                    val = val.maxLength(max + 3, '...');

            } else if (type === 'number' || util.isDate(val))
                val = val.format(format);
        }

        val = val.toString();
        formatted = formatted.replace(prop, isEncode ? val.htmlEncode() : val);
    });

    return formatted;
};

/*
    Set max length of string
    @max {Number}
    @chars {String} :: optional, default ...
    return {String}
*/
String.prototype.maxLength = function (max, chars) {
    var str = this.toString();
    return str.length > max ? str.substring(0, max - chars.length) + (typeof (c) === 'undefined' ? '...' : chars) : str;
};

String.prototype.isJSON = function () {
    var a = this[0];
    var b = this[this.length - 1];
    return (a === '"' && b === '"') || (a === '[' && b === ']') || (a === '{' && b === '}');
};

String.prototype.isURL = function () {
    var str = this.toString();
    if (str.length <= 7)
        return false;
    return new RegExp('^(http[s]?:\\/\\/(www\\.)?|ftp:\\/\\/(www\\.)?|www\\.){1}([0-9A-Za-z-\\.@:%_\+~#=]+)+((\\.[a-zA-Z]{2,3})+)(/(.)*)?(\\?(.)*)?').test(str);
};

String.prototype.isEmail = function () {
    var str = this.toString();
    if (str.length <= 4)
        return false;
    return RegExp('^[a-zA-Z0-9-_.]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$').test(str);
};

/*
    @def {Number} :: optional, default 0
    return {Number}
*/
String.prototype.parseInt = function (def) {
    var num = 0;
    var str = this.toString();

    if (str.substring(0, 1) === '0')
        num = parseInt(str.replace(/\s/g, '').substring(1));
    else
        num = parseInt(str.replace(/\s/g, ''));

    if (isNaN(num))
        return def || 0;

    return num;
};

/*
    @def {Number} :: optional, default 0
    return {Number}
*/
String.prototype.parseFloat = function (def) {
    var num = 0;
    var str = this.toString();

    if (str.substring(0, 1) === '0')
        num = parseFloat(str.replace(/\s/g, '').substring(1).replace(',', '.'));
    else
        num = parseFloat(str.replace(/\s/g, '').replace(',', '.'));

    if (isNaN(num))
        return def || 0;

    return num;
};

/*
    @max {Number}
    @c {String} :: optional
    return {String}
*/
String.prototype.padLeft = function (max, c) {
    var self = this.toString();
    return Array(Math.max(0, max - self.length + 1)).join(c || '0') + self;
};

/*
    @max {Number}
    @c {String} :: optional
    return {String}
*/
String.prototype.padRight = function (max, c) {
    var self = this.toString();
    return self + Array(Math.max(0, max - self.length + 1)).join(c || '0');
};

/*
	isNumber?
	@isDecimal {Boolean} :: optional, default false
	return {Boolean}
*/
String.prototype.isNumber = function(isDecimal) {
	
	var self = this.toString();

	if (self.length === 0)
		return false;

	isDecimal = isDecimal || false;

	for (var i = 0; i < self.length; i++) {
		var ascii = self.charCodeAt(i);

		if (isDecimal) {
			if (ascii === 44 || ascii == 46) {
				isDecimal = false;
				continue;
			}
		}

		if (ascii < 48 || ascii > 57)
			return false;
	}
	
	return true;
};

/*
    @decimals {Number}
    return {Number}
*/
Number.prototype.floor = function (decimals) {
    return Math.floor(this * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/*
    @decimals {Number}
    return {Number}
*/
Number.prototype.round = function (decimals) {
    return Math.round(this * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/*
    Format number :: 10000 = 10 000
    @format {Number or String} :: number is decimal and string is specified format, example: ## ###.##
    return {String}
*/
Number.prototype.format = function (format) {

    var index = 0;
    var num = this.toString();
    var beg = 0;
    var end = 0;
    var output = '';

    if (typeof (format) === 'string') {

        var d = false;

        for (var i = 0; i < format.length; i++) {
            var c = format.substring(i, i + 1);
            if (c === '#') {
                if (d)
                    end++;
                else
                    beg++;
            }

            if (c === '.')
                d = true;
        }

        var strBeg = num;
        var strEnd = '';

        index = num.indexOf('.');

        if (index !== -1) {
            strBeg = num.substring(0, index);
            strEnd = num.substring(index + 1);
        }

        if (strBeg.length > beg) {
            var max = strBeg.length - beg;
            var tmp = '';
            for (var i = 0; i < max; i++)
                tmp += '#';

            format = tmp + format;
        }

        if (strBeg.length < beg)
            strBeg = strBeg.padLeft(beg, ' ');

        if (strEnd.length < end)
            strEnd = strEnd.padRight(end, '0');

        if (strEnd.length > end)
            strEnd = strEnd.substring(0, end);

        d = false;
        index = 0;

        var skip = true;

        for (var i = 0; i < format.length; i++) {

            var c = format.substring(i, i + 1);

            if (c !== '#') {

                if (skip)
                    continue;

                if (c === '.') {
                    d = true;
                    index = 0;
                }

                output += c;
                continue;
            }

            var value = d ? strEnd.substring(index, index + 1) : strBeg.substring(index, index + 1);

            if (skip)
                skip = [',', ' '].indexOf(value) !== -1;

            if (!skip)
                output += value;

            index++;
        }

        return output;
    }

    output = '### ### ###';
    var beg = num.indexOf('.');
    var max = format || 0;

    if (max === 0 && num != -1)
        max = num.length - (beg + 1);

    if (max > 0) {
        output += '.';
        for (var i = 0; i < max; i++)
            output += '#';
    }

    return this.format(output);
};

/*
    @count {Number}
*/
Array.prototype.take = function (count) {
    var arr = [];
    var self = this;
    for (var i = 0; i < self.length; i++) {
        arr.push(self[i]);
        if (arr.length >= count)
            return arr;
    }
    return arr;
};

/*
    @count {Number}
*/
Array.prototype.skip = function (count) {
    var arr = [];
    var self = this;
    for (var i = 0; i < self.length; i++) {
        if (i >= count)
            arr.push(self[i]);
    }
    return arr;
};

/*
    @cb {Function} :: return true if is finded
*/
Array.prototype.find = function (cb) {
    var self = this;
    for (var i = 0; i < self.length; i++) {
        if (cb(self[i], i))
            return self[i];
    }
    return null;
};

/*
    @cb {Function} :: return true if is removed
*/
Array.prototype.remove = function (cb) {
    var self = this;
    var arr = [];
    for (var i = 0; i < self.length; i++) {
        if (!cb(self[i], i))
            arr.push(self[i]);
    }
    return arr;
};

/*
    @cb {Function}
*/
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (cb) {
        var arr = this;
        for (var i = 0; i < arr.length; i++)
            cb(arr[i], i);
        return arr;
    };
}

/*
    @cb {Function} :: return index
*/
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (value) {
        var arr = this;
        for (var i = 0; i < arr.length; i++) {
            if (value === arr[i])
                return i;
        }
        return -1;
    };
}

(function ($) {
    $.toJSON = function (o) {
        if (typeof (JSON) == 'object' && JSON.stringify) return JSON.stringify(o);
        var type = typeof (o);
        if (o === null) return "null";
        if (type === "undefined") return undefined;
        if (type === "number" || type === "boolean") return o + '';
        if (type === "string") return $.quoteString(o);
        if (type === 'object') {
            if (typeof o.toJSON == "function") return $.toJSON(o.toJSON());
            if (o.constructor === Date) {
                var month = o.getUTCMonth() + 1;
                if (month < 10) month = '0' + month;
                var day = o.getUTCDate();
                if (day < 10) day = '0' + day;
                var year = o.getUTCFullYear();
                var hours = o.getUTCHours();
                if (hours < 10) hours = '0' + hours;
                var minutes = o.getUTCMinutes();
                if (minutes < 10) minutes = '0' + minutes;
                var seconds = o.getUTCSeconds();
                if (seconds < 10) seconds = '0' + seconds;
                var milli = o.getUTCMilliseconds();
                if (milli < 100) milli = '0' + milli;
                if (milli < 10) milli = '0' + milli;
                return '"' + year + '-' + month + '-' + day + 'T' + hours + ':' + minutes + ':' + seconds + '.' + milli + 'Z"';
            }
            if (o.constructor === Array) {

                var l = o.length;

                var ret = [];
                for (var i = 0; i < l; i++)

                    ret.push($.toJSON(o[i]) || "null");
                return "[" + ret.join(",") + "]";

            }

            var pairs = [];
            for (var k in o) {

                var name;
                var type = typeof k;
                if (type === "number")
                    name = '"' + k + '"';
                else if (type === "string")
                    name = $.quoteString(k);
                else continue;
                if (typeof o[k] === "function")
                    continue;
                var val = $.toJSON(o[k]);
                pairs.push(name + ":" + val);
            }
            return "{" + pairs.join(", ") + "}";
        }

    };
    $.evalJSON = function (src) {

        if (typeof (JSON) == 'object' && JSON.parse)
            return JSON.parse(src);
        return eval("(" + src + ")");

    };
    $.secureEvalJSON = function (src) {
        if (typeof (JSON) === 'object' && JSON.parse)
            return JSON.parse(src);
        var filtered = src;
        filtered = filtered.replace(/\\["\\\/bfnrtu]/g, '@');
        filtered = filtered.replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']');
        filtered = filtered.replace(/(?:^|:|,)(?:\s*\[)+/g, '');
        if (/^[\],:{}\s]*$/.test(filtered))
            return eval("(" + src + ")");
        else throw new SyntaxError("Error parsing JSON, source is not valid.");
    };
    $.quoteString = function (string) {
        if (string.match(_escapeable)) {
            return '"' + string.replace(_escapeable, function (a) {
                var c = _meta[a];
                if (typeof c === 'string') return c;
                c = a.charCodeAt();
                return '\\u00' + Math.floor(c / 16)
                    .toString(16) + (c % 16)
                    .toString(16);
            }) + '"';
        }
        return '"' + string + '"';
    };
    var _escapeable = /["\\\x00-\x1f\x7f-\x9f]/g;
    var _meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"': '\\"',
        '\\': '\\\\'
    };
})(jQuery);

var framework = new Framework();
var utils = new Utils();

