"use strict";

var LIMIT_HISTORY = 100;
var LIMIT_HISTORY_ERROR = 100;

var _escapeable = /["\\\x00-\x1f\x7f-\x9f]/g;
var _meta = {'\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };
var _selector = { '#': 'getElementById', '.': 'getElementsByClassName', '@': 'getElementsByName', '=': 'getElementsByTagName', '*': 'querySelectorAll' };
var _handlers = {};

var DOM = {};
var utils = {};

var framework = {
    version: 101,
    routes: [],
    history: [],
    errors: [],
    config: {},
    events: {},
    global: {},
    params: {},
    locked: {},
    templates: {},
    partials: {},
    repository: {},
    resources: {},
    url: '',
    cache: null,
    model: null,
    isFirst: true,
    isReady: false,
    isRefreshed: false,
    isSupportHistory: typeof(history.pushState) !== 'undefined',
    count: 0
};

DOM.ready = function(fn) {

    var add = document.addEventListener || document.attachEvent;
    var rem =  document.removeEventListener || document.detachEvent;
    var name = document.addEventListener ? 'DOMContentLoaded' : 'onreadystatechange';

    var evt = function evt() {
        rem.call(document, name, evt, false);
        fn();
    };

    add.call(document, name, evt, false);
};

DOM.selector = function(query) {
    var regex = /[=#@.*]/.exec(query)[0];
    return (document[_selector[regex]](query.split(regex)[1]));
};

DOM.content = function(query, content, isText) {
    var el = DOM.selector(query);

    if (el === null)
        return false;

    if (typeof(el.length) === 'undefined') {
        if (isText)
            el.innerText = content;
        else
            el.innerHTML = content;
        return true;
    }

    for (var i = 0; i < el.length; i++) {
        if (isText)
            el.innerText = content;
        else
            el.innerHTML = content;
    }

    return el.length > 0;
};

/*
    Unbind event from element
    @el {HTMLElement or String(Selector)}
    @type {String} :: name of event
    @name {String} :: bind name
    @fn {Function}
    return {HTMLElement}
*/
DOM.bind = function(el, type, name, fn) {

    if (typeof(el) === 'string')
        return DOM.bind(DOM.selector(el), type, name, fn);

    if (typeof(el.screen) === 'undefined') {
        if (typeof(el.length) !== 'undefined') {

            for (var i = 0; i < el.length; i++)
                DOM.bind(el[i], type, name, fn);

            return el;
        };
    }

    _handlers[name] = fn;

    if (el.addEventListener)
        el.addEventListener(type, _handlers[name].bind(el), false);
    else
        el.attachEvent('on' + type, _handlers[name].bind(el));

    return el;
};

/*
    Unbind event from element
    @el {HTMLElement or String(Selector)}
    @type {String} :: name of event
    @name {String} :: function name
    return {HTMLElement}
*/
DOM.unbind = function(el, type, name) {

    if (typeof(el) === 'string')
        return DOM.unbind(DOM.selector(el), type, name);

    if (typeof(el.screen) === 'undefined') {
        if (typeof(el.length) !== 'undefined') {

            for (var i = 0; i < el.length; i++)
                DOM.unbind(el[i], type, name);

            return el;
        };
    }

    var fn = _handlers[name];

    if (typeof(fn) === 'undefined')
        return el;

    if(el.removeEventListener)
        el.removeEventListener(type, fn, false);
    else
        el.detachEvent('on' + type, fn);

    return el;
};

/*
    Capture event
    @name {String}
    @fn {Function}
    return {Framework}
*/
framework.on = function(name, fn) {
    var self = this;

    var e = self.events[name];

    if (e) {
        e.push(fn);
        return self;
    }

    self.events[name] = [fn];
    return self;
};

/*
    Emit Event
    @name {String}
    return {Framework}
*/
framework.emit = function(name) {

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
    Route
    @url {String}
    @fn {Function}
    @partial {String Array} :: optional
    @once {Boolean} :: optional, default false
    return {Framework}
*/
framework.route = function(url, fn, partial, once) {

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

    self.routes.push({ url: route, fn: fn, priority: priority, params: params, partial: partial || [], once: once, count: 0 });

    self.routes.sort(function(a, b) {
        if (a.priority > b.priority)
            return -1;

        if (a.priority < b.priority)
            return 1;

        return 0;
    });

    return self;
};

framework.partial = function(name, fn) {
    var self = this;

    if (typeof(fn) === 'undefined') {

        if (name instanceof Array) {

            name.forEach(function(o) {
                var partial = self.partials[name] || null;
                if (partial === null)
                    return;

                partial.call(self, self.url);
            });

            return self;
        }

        var partial = self.partials[name] || null;
        if (partial !== null)
            partial.call(self, self.url);

        return;
    };

    self.partials[name] = fn;
    return self;
};

framework.refresh = function() {
    var self = this;
    return self.location(self, true);
};

framework._route = function(url) {
    url = url.toLowerCase();

    if (url.charIndex(0) === '/')
        url = url.substring(1);

    if (url.charIndex(url.length - 1) === '/')
        url = url.substring(0, url.length - 1);

    var arr = url.split('/');
    if (arr.length === 1 && arr[0] === '')
        arr[0] = '/';

    return arr;
};

framework._routeParam = function(routeUrl, route) {
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

framework._routeCompare = function(url, route) {

    var skip = url.length === 1 && url[0] === '/';

    for (var i = 0; i < url.length; i++) {

        var value = route[i];

        if (typeof(value) === 'undefined')
            return false;

        if (!skip && value.charIndex(0) === '{')
            continue;

        if (value === '*')
            return true;

        if (url[i] !== value)
            return false;
    }

    return true;
};

framework.location = function(url, isRefresh) {

    var index = url.indexOf('?');
    if (index !== -1)
        url = url.substring(0, index);

    url = utils.prepareUrl(url);
    url = utils.path(url);

    var self = this;
    var path = self._route(url);
    var routes = [];
    var notfound = true;

    self.isRefreshed = isRefresh || false;
    self.count++;

    if (!isRefresh) {
        if (self.url.length > 0 && self.history[self.history.length - 1] !== self.url) {
            self.history.push(self.url);
            if (self.history.length > LIMIT_HISTORY)
                self.history.shift();
        }
    }

    for (var i = 0; i < self.routes.length; i++) {
        var route = self.routes[i];
        if (self._routeCompare(path, route.url)) {

            if (route.url.indexOf('*') === -1)
                notfound = false;

            if (route.once && route.count > 0)
                continue;

            route.count++;
            routes.push(route);
        }
    }

    var isError = false;
    var error = '';

    self.url = url;
    self.repository = {};
    self._params();

    self.emit('location', url);
    routes.forEach(function(route) {

        try
        {
            route.partial.forEach(function(name) {
                var partial = self.partials[name];
                if (typeof(partial) === 'undefined')
                    return;
                partial.call(self, self.url);
            });
        } catch (ex) {
            isError = true;
            error += (error !== '' ? '\n' : '') + ex.toString();
            self.emit('error', ex, url, 'execute - partial');
        }

        try
        {
            route.fn.apply(self, self._routeParam(path, route));
        } catch (ex) {
            isError = true;
            error += (error !== '' ? '\n' : '') + ex.toString();
            self.emit('error', ex, url, 'execute - route');
        }

    });

    if (isError)
        self.status(500, error);

    if (notfound)
        self.status(404, 'not found');
};

framework.back = function() {
    var self = this;
    var url = self.history.pop() || '/';
    self.url = '';
    self.redirect(url, true);
    return self;
};

framework.status = function(code, message) {
    var self = this;
    self.emit('status', code || 404, message);
    return self;
};

framework.resource = function(name, key) {

    if (typeof(key) === 'undefined') {
        key = name;
        name = 'default';
    }

    var resource = this.resources[name] || {};
    return resource[key] || '';
};

framework.POST = function(url, data, cb, key, expire) {

    var self = this;

    if (self.locked[url])
        return false;

    var isCache = (typeof(key) !== 'undefined');

    var post = (function() {

        self.locked[url] = true;
        self.emit('post', true, url);

        var xhr = new XMLHttpRequest();

        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.onreadystatechange = function() {

            if (xhr.readyState !== 4)
                return;

            delete self.locked[url];

            if (xhr.status > 399) {
                self.emit('error', new Error(xhr.status + ': ' + xhr.statusText), url, 'post');
                return;
            }

            var d = xhr.responseText;

            if (d.isJSON())
                d = d.JSON();

            self.emit('post', false, url, d);

            if (isCache)
                self.cache.write(key, d, new Date().add('m', expire || 10));

            xhr = null;
            cb(d);
        };

        xhr.send(utils.serialize(data));
    });

    if (!isCache) {
        post();
        return true;
    }

    var d = self.cache.read(key);
    if (d === null)
        post();
    else
        cb(d);

    return true;
};

framework.GET = function(url, cb, key, expire) {

    var self = this;

    if (self.locked[url])
        return false;

    var isCache = (typeof(key) !== 'undefined');
    var get = (function() {

        self.locked[url] = true;
        self.emit('get', true, url);

        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.onreadystatechange = function() {

            if (xhr.readyState !== 4)
                return;

            delete self.locked[url];

            if (xhr.status > 399) {
                self.emit('error', new Error(xhr.status + ': ' + xhr.statusText), url, 'get');
                return;
            }

            var d = xhr.responseText;

            if (d.isJSON())
                d = d.JSON();

            self.emit('get', false, url, d);

            if (isCache)
                self.cache.write(key, d, new Date().add('m', expire || 10));

            xhr = null;
            cb(d);
        };

        xhr.send();

    });

    if (!isCache) {
        get();
        return self;
    }

    var d = self.cache.read(key);
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
framework.validate = function(model, properties, resource, prefix) {

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

framework.redirect = function(url, model) {
    var self = this;

    if (!self.isSupportHistory) {
        window.location.href = '/#!' + utils.path(url);
        self.model = model || null;
        return self;
    }

    history.pushState(null, null, url);
    self.model = model || null;
    self.location(url, false);

    return self;
};

/*
    Register template
    @name {String}
    @template {String} or {String DOM selector}
    return {Framework}
*/
framework.template = function(name, template) {

    var self = this;

    if (template.indexOf('{') === -1) {
        var el = DOM.selector(template);
        if (el !== null) {
            if (el.length > 0)
                el = el[0];

            var tag = el.tagName.toLowerCase();
            if (tag === 'input')
                template = el.value || '';
            else
                template = el.innerHTML || '';
        }
    }

    self.templates[name] = template;
    self.cache.remove('template.' + name);
    return self;
};

framework.render = function(name, model, repository) {
    var self = this;
    var template = new Template(self, name, model, repository);
    return template.render();
};

framework.log = function() {
    var self = this;
    self.onLog.apply(self, arguments);
    return self;
};

framework.onValidation = null;

framework.onLog = function() {
    var self = this;

    if (!console || !console.log || !console.log.apply)
        return self;

    var arr = [];

    for (var i = 0; i < arguments.length; i++)
        arr.push(arguments[i]);

    console.log.apply(console, arr);
    return self;
};

framework.cookie = {
    read: function (name) {
        var arr = document.cookie.split(';');
        for (var i = 0; i < arr.length; i++) {
            var c = arr[i];
            if (c.charAt(0) === ' ')
                c = c.substring(1);
            var v = c.split('=');
            if (v.length > 1) {
                if (v[0] === name)
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
        } else if (expire instanceof Date)
            expires = '; expires=' + expire.toGMTString();
        document.cookie = name + '=' + value + expires + '; path=/';
    },
    remove: function (name) {
        this.write(name, '', -1);
    }
};

framework._params = function() {

    var self = this;
    var data = {};

    var params = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');

    for (var i = 0; i < params.length; i++) {

        var param = params[i].split('=');
        if (param.length !== 2)
            continue;

        var name = decodeURIComponent(param[0]);
        var value = decodeURIComponent(param[1]);
        var isArray = data[name] instanceof Array;

        if (typeof(data[name]) !== 'undefined' && !isArray)
            data[name] = [data[name]];

        if (isArray)
            data[name].push(value);
        else
            data[name] = value;
    }

    self.params = data;
    return self;
};

function CacheItem(id, expire, value) {
    this.id = id;
    this.expire = expire;
    this.value = value;
    this.isRemoved = false;
};

/*
    Cache class
    @application {Framework}
*/
function Cache(framework) {
    this.repository = {};
    this.count = 1;
    this.framework = framework;
    this.interval = null;
};

Cache.prototype.init = function() {
    var self = this;
    self.interval = setInterval(function() {
        self.recycle();
    }, 1000 * 60);
    return self;
};

Cache.prototype.clear = function() {
    var self = this;
    self.repository = {};
    return self;
};

/*
    Internal function
    return {Cache}
*/
Cache.prototype.recycle = function() {

    var self = this;
    var repository = self.repository;
    var keys = utils.keys(repository);

    if (keys.length === 0) {
        self.framework.emit('service', self.count++);
        return self;
    }

    var expire = new Date();

    keys.forEach(function(o) {
        if (repository[o].expire < expire)
            delete repository[o];
    });

    self.framework.emit('service', self.count++);
    return self;
};

/*
    Add item to cache
    @name {String}
    @value {Object}
    @expire {Date}
    return @value
*/
Cache.prototype.write = function(name, value, expire) {
    var self = this;

    if (typeof(expire) === 'undefined')
        expire = new Date().add('m', 5);

    self.repository[name] = { value: value, expire: expire };
    return value;
};

/*
    Read item from cache
    @name {String}
    return {Object}
*/
Cache.prototype.read = function(name) {
    var self = this;
    var value = self.repository[name] || null;

    if (value === null)
        return null;

    return value.value;
};

/*
    Update cache item expiration
    @name {String}
    @expire {Date}
    return {Cache}
*/
Cache.prototype.setExpires = function(name, expire) {
    var self = this;
    var obj = self.repository[name];

    if (typeof(obj) === 'undefined')
        return self;

    obj.expire = expire;
    return self;
};

/*
    Remove item from cache
    @name {String}
    return {Object} :: return value;
*/
Cache.prototype.remove = function(name) {
    var self = this;
    var value = self.repository[name] || null;

    delete self.repository[name];
    return value;
};

/*
    Remove all
    @search {String}
    return {Number}
*/
Cache.prototype.removeAll = function(search) {
    var self = this;
    var count = 0;

    utils.keys(self.repository).forEach(function(o) {
        if (o.indexOf(search) !== -1) {
            self.remove(o);
            count++;
        }
    });

    return count;
};

/*
    Template class
    @controller {Controller}
    @model {Object}
    @repository {Object}
    return {Template}
*/
function Template(framework, name, model, repository) {

    this.name = name;
    this.model = model;
    this.repository = repository || null;
    this.cache = framework.cache;
    this.framework = framework;

    if (typeof(model) === 'undefined')
        model = '';

    if (model !== null && !(model instanceof Array))
        this.model = [model];
};

/*
    Parse HTML
    @html {String}
    @isRepository {Boolean}
    return {Object}
*/
Template.prototype.parse = function(html, isRepository) {

    var self = this;
    var indexBeg = html.indexOf('<!--');
    var indexEnd = html.lastIndexOf('-->');

    var beg = '';
    var end = '';
    var template = html.trim();

    if (indexBeg !== -1 && indexEnd !== -1) {
        beg = html.substring(0, indexBeg).trim();
        end = html.substring(indexEnd + 3).trim();
        template = html.substring(indexBeg + 4, indexEnd).trim();
    }

    var indexBeg = 0;
    var indexer = 0;
    var index = 0;

    var builder = [];
    var property = [];
    var keys = {};

    var tmp = template.match(/\{[^}\n]*\}/g);

    if (tmp === null)
        tmp = [];

    for (var i = 0; i < tmp.length; i++) {

        var format = '';
        var name = tmp[i];
        var isEncode = true;

        index = name.indexOf('|');
        indexEnd = template.indexOf(name, indexBeg);

        var b = template.substring(indexBeg, indexEnd);
        builder.push(b);

        indexBeg = indexEnd + name.length;

        if (index !== -1) {

            format = name.substring(index + 1, name.length - 1).trim();
            name = name.substring(1, index);
            var pluralize = parsePluralize(format);
            if (pluralize.length === 0) {
                if (format.indexOf('#') === -1) {
                    var condition = parseCondition(format);
                    if (condition.length === 0) {
                        var count = utils.parseInt(format);
                        if (count === 0) {
                            format = ".format('" + format + "')";
                        } else
                            format = ".maxLength(" + (count + 3) + ",'...')";
                    } else
                        format = ".condition(" + condition + ")";
                } else
                    format = ".format('" + format + "')";
            } else
                format = pluralize;
        }
        else
            name = name.substring(1, name.length - 1);

        if (name.charIndex(0) === '!') {
            name = name.substring(1);
            isEncode = false;
        }

        name = name.trim();

        if (isEncode)
            format += '.toString().htmlEncode()';

        var key = name + format;
        var indexer = keys[key];

        if (typeof(indexer) === 'undefined') {
            property.push(name.trim());
            indexer = property.length - 1;
            keys[key] = indexer;
        }

        builder.push('prop[' + indexer + ']' + format);
    }

    if (indexBeg !== template.length)
        builder.push(template.substring(indexBeg));

    var fn = [];
    for (var i = 0; i < builder.length; i++) {

        var str = builder[i];

        if (i % 2 !== 0)
            fn.push(str);
        else
            fn.push("'" + str.replace(/\'/g, "\'").replace(/\n/g, '\\n') + "'");
    }

    var repositoryBeg = null;
    var repositoryEnd = null;

    if (!isRepository && self.repository !== null) {
        repositoryBeg = beg.indexOf('{') !== -1 ? self.parse(beg, true) : null;
        repositoryEnd = end.indexOf('{') !== -1 ? self.parse(end, true) : null;
    }

    try
    {
        //return { generator: new Function('generator', ) eval('(function(prop){return ' + fn.join('+') + ';})'), beg: beg, end: end, property: property, repositoryBeg: repositoryBeg, repositoryEnd: repositoryEnd };
        return { generator: new Function('prop', 'return ' + fn.join('+')), beg: beg, end: end, property: property, repositoryBeg: repositoryBeg, repositoryEnd: repositoryEnd };
    } catch (ex) {
        self.framework.emit('error', ex, self.framework.url, 'Template');
    }
};

/*
    Internal function
    @value {String}
    return {String}
*/
function parseCondition(value) {

    value = value.trim();

    var condition = value.charIndex(0);
    if (condition !== '"' && condition !== '\'')
        return '';

    var index = value.indexOf(condition, 1);
    if (index === -1)
        return '';

    var a = value.substring(1, index).replace(/\'/g, "\\'");
    index = value.indexOf(condition, index + 2);

    if (index === -1)
        return "'{0}'".format(a);

    return "'{0}','{1}'".format(a, value.substring(index + 1, value.length - 1).replace(/\'/g, "\\'"));
};

/*
    Internal function
    @value {String}
    return {String}
*/
function parsePluralize(value) {

    value = value.trim();

    var condition = value.substring(0, 1);
    if (condition !== '"' && condition !== '\'')
        return '';

    var index = value.indexOf(condition, 1);
    if (index === -1)
        return '';

    var a = value.substring(1, index).replace(/\'/g, "\\'");
    var b = '';
    var c = '';
    var d = '';

    var beg = value.indexOf(condition, index + 1);

    if (beg === -1)
        return '';

    index = value.indexOf(condition, beg + 1);
    b = value.substring(beg + 1, index).replace(/\'/g, "\\'");
    c = '';

    beg = value.indexOf(condition, index + 1);
    if (beg === -1)
        return '';

    index = value.indexOf(condition, beg + 1);
    c = value.substring(beg + 1, index).replace(/\'/g, "\\'");

    beg = value.indexOf(condition, index + 1);
    if (beg === -1)
        return -1;

    index = value.indexOf(condition, beg + 1);
    d = value.substring(beg + 1, index).replace(/\'/g, "\\'");

    return ".pluralize('{0}','{1}','{2}', '{3}')".format(a, b, c, d);
};

Template.prototype.load = function() {

    var self = this;

    var generator = self.cache.read('template.' + self.name);
    if (generator !== null)
        return generator;

    var template = self.framework.templates[self.name] || '';
    if (template.length === 0)
        return null;

    generator = self.parse(template);
    self.cache.write('template.' + self.name, generator, new Date().add('m', 5));
    return generator;
};

/*
    Render HTML
    @name {String}
    return {String}
*/
Template.prototype.render = function() {

    var self = this;

    var generator = self.load();
    if (generator === null)
        return '';

    var mid = template_compile(generator, self.model, true);
    var beg = generator.repositoryBeg !== null ? template_compile(generator.repositoryBeg, self.repository) : generator.beg;
    var end = generator.repositoryEnd !== null ? template_compile(generator.repositoryEnd, self.repository) : generator.end;

    if (name !== 'comments')
        return beg + mid + end;

    return beg + mid + end;
};

/*
    Eval parsed code
    @generator {Object}
    @obj {Array}
    @plain {Boolean} :: internal property
    return {String}
*/
function template_compile(generator, obj, plain) {

    var html = '';

    if (plain) {

        if (!(obj instanceof Array))
            obj = [obj];

        for (var j = 0; j < obj.length; j++)
            html += template_compile_eval(generator, obj[j], j);

    } else
        html = template_compile_eval(generator, obj, 0);

    return plain ? html : generator.beg + html + generator.end;
};

/*
    Eval parsed code
    @generator {Object}
    @model {Object}
    return {String}
*/
function template_compile_eval(generator, model, indexer) {

    var params = [];
    for (var i = 0; i < generator.property.length; i++) {

        var property = generator.property[i];
        var val;

        if (property !== '') {

            if (property.indexOf('.') !== -1) {
                var arr = property.split('.');
                if (arr.length === 2)
                    val = model[arr[0]][arr[1]];
                else if (arr.length === 3)
                    val = model[arr[0]][arr[1]][arr[3]];
                else if (arr.length === 4)
                    val = model[arr[0]][arr[1]][arr[3]][arr[4]];
                else if (arr.length === 5)
                    val = model[arr[0]][arr[1]][arr[3]][arr[4]][arr[5]];
            } else if (property === '#')
                val = indexer;
            else
                val = model[property];
        } else
            val = model;

        if (typeof(val) === 'function')
            val = val(i);

        if (typeof(val) === 'undefined' || val === null)
            val = '';

        params.push(val);
    }

    return generator.generator.call(this, params);
}

/*
    Create UniqueIdentifier
    @max {Number} :: optional, default 40
    return {String}
*/
utils.GUID = function(max) {

    max = max || 40;

    var rnd = function () {
        return Math.floor(Math.random() * 65536).toString(16);
    };

    var str = '';
    for (var i = 0; i < (max / 4) + 1; i++)
        str += rnd();

    return str.substring(0, max);
};

/*
    Get clean path
    @url {String}
    @d {String} :: delimiter, optional, default /
    return {String}
*/
utils.path = function (url, d) {

    if (typeof (d) === 'undefined')
        d = '/';

    var index = url.indexOf('?');
    var params = '';

    if (index !== -1) {
        params = url.substring(index);
        url = url.substring(0, index);
    }

    var c = url.charIndex(url.length - 1);
    if (c !== d)
        url += d;

    return url + params;
};

/*
    Get object keys
    @obj {Object}
    return {Array}
*/
utils.keys = function(obj) {

    if (typeof(Object.keys) !== 'undefined')
        return Object.keys(obj);

    var arr = [];

    for (var m in obj)
        arr.push(m);

    return arr;
};

/*
    parseInt
    @obj {Object}
    @def {Number}
    return {Number}
*/
utils.parseInt = function(obj, def) {
    var type = typeof(obj);

    if (type === 'undefined')
        return def || 0;

    var str = type !== 'string' ? obj.toString() : obj;
    return str.parseInt(def);
};

/*
    parseFloat
    @obj {Object}
    @def {Number}
    return {Number}
*/
utils.parseFloat = function(obj, def) {
    var type = typeof(obj);

    if (type === 'undefined')
        return def || 0;

    var str = type !== 'string' ? obj.toString() : obj;
    return str.parseFloat(def);
};

function quoteString(string) {
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


/*
    Object serializer
    @obj {Object}
    @format {String} :: optional, default empty (example: JSON)
    return {String}
*/
utils.serialize = function(obj, format) {

    var type = typeof(obj);

    if (type === 'function')
        return utils.serialize(obj(), format);

    if (format === 'json' || format === 'JSON')
        return utils.JSON(obj);

    if (type !== 'object')
        return (obj || '').toString();

    var buffer = [];

    for (var prop in obj) {
        var val = obj[prop];
        type = typeof(val);

        if (type === 'function')
            continue;

        if (val === null)
            continue;

        buffer.push(encodeURIComponent(prop) + '=' + encodeURIComponent((val || '').toString()));
    }

    return buffer.join('&');
};

/*
    Object to JSON
    @o {Object}
    return {String}
*/
utils.JSON = function(o) {

    if (typeof (JSON) == 'object' && JSON.stringify)
        return JSON.stringify(o);

    var type = typeof(o);

    if (o === null)
        return 'null';

    if (type === 'undefined')
        return undefined;

    if (type === 'number' || type === 'boolean')
        return o + '';

    if (type === 'string')
        return quoteString(o);

    if (type !== 'object')
        return undefined;

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
            ret.push(utils.JSON(o[i]) || 'null');

        return '[' + ret.join(',') + ']';
    }

    var pairs = [];

    for (var k in o) {
        var name;
        var type = typeof k;

        if (type === 'number')
            name = '"' + k + '"';
        else if (type === 'string')
            name = quoteString(k);
        else
            continue;

        if (typeof o[k] === 'function')
            continue;

        var val = utils.JSON(o[k]);
        pairs.push(name + ':' + val);
    }

    return '{' + pairs.join(', ') + '}';
};

/*
    Prepare Hashtag url
    @url {String}
    return {String}
*/
utils.prepareUrl = function(url) {

    var index = url.indexOf('#!');
    if (index !== -1)
        return url.substring(index + 2);

    return url;
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

String.prototype.charIndex = function(index) {
    return this.toString().substring(index, index + 1);
};

String.prototype.parseDate = function () {

    var str = this.toString();

    if (str.charIndex(0) === '/' && str.charIndex(str.length - 1) === '/')
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

String.prototype.hash = function() {
    var s = this.toString();
    return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
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
    var str = this.toString();
    var a = str.substring(0, 1);
    var b = str.substring(str.length - 2, str.length - 1);
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

String.prototype.JSON = function() {
    var src = this;
    if (typeof (JSON) == 'object' && JSON.parse)
        return JSON.parse(src);
    return eval('(' + src + ')');
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

String.prototype.pluralize = function(zero, one, few, other) {
    var str = this.toString();
    return str.parseInt().pluralize(zer, one, few, other)
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
    Pluralize number
    zero {String}
    one {String}
    few {String}
    other {String}
    return {String}
*/
Number.prototype.pluralize = function(zero, one, few, other) {

    var num = parseInt(this);
    var value = '';

    if (num === 0)
        value = zero || '';
    else if (num === 1)
        value = one || '';
    else if (num > 1 && num < 5)
        value = few || '';
    else
        value = other;

    var beg = value.indexOf('#');
    var end = value.lastIndexOf('#');

    if (beg === -1)
        return value;

    var format = value.substring(beg, end + 1);
    return num.format(format) + value.replace(format, '');
};

Number.prototype.condition = function(ifTrue, ifFalse) {
    return (parseInt(this) % 2 === 0 ? ifTrue : ifFalse) || '';
};

Boolean.prototype.condition = function(ifTrue, ifFalse) {
    return (this ? ifTrue : ifFalse) || '';
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

// https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/bind
if (!Function.prototype.bind) {
    Function.prototype.bind = function (oThis) {
        if (typeof this !== 'function')
            throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
        var aArgs = Array.prototype.slice.call(arguments, 1), fToBind = this, fNOP = function () {}, fBound = function () { return fToBind.apply(this instanceof fNOP && oThis ? this : oThis, aArgs.concat(Array.prototype.slice.call(arguments))); };
        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP();
        return fBound;
    };
}

DOM.bind(window, 'popstate', 'popstate', function() {
    if (framework.count === 1)
        return;
    var url = window.location.hash || '';
    if (url.length === 0)
        url = window.location.pathname;
    framework.location(utils.path(url));
});

DOM.bind(window, 'hashchange', 'hashchange', function() {
    if (!framework.isReady)
        return;
    var url = window.location.hash || '';
    if (url.length === 0)
        url = window.location.pathname;
    framework.location(utils.path(url));
});

if (navigator.appVersion.indexOf('MSIE 7.') !== -1) {
    setInterval(function() {
        if (!framework.isReady)
            return;

        var url = window.location.hash || '';
        if (url.length === 0)
            url = window.location.pathname;

        url = utils.path(url);

        if (url !== framework.url)
            framework.location(url);

    }, 500);
}

framework.cache = new Cache(framework);
framework.cache.init();
framework.resources['default'] = {};
framework.config.debug = false;

framework.on('error', function (err, url, name) {
    var self = this;
    self.errors.push({ error: err, url: url, name: name, date: new Date() });
    if (self.errors.length > LIMIT_HISTORY_ERROR)
        self.errors.shift();
});

DOM.ready(function() {
    var url = window.location.hash || '';
    if (url.length === 0)
        url = window.location.pathname;

    if (typeof(framework.events['ready']) === 'undefined')
        framework.location(utils.path(utils.prepareUrl(url)));
    else
        framework.emit('ready', utils.path(utils.prepareUrl(url)));

});