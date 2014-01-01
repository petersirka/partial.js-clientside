# partial.js client-side routing

Framework supports HTML 5 History API and for older browsers (IE7, IE8, IE9) is automatically enabled URL hashtag. Best works with jQuery.

- easy to use
- minified only 9.5 kB (without GZIP compression)
- great functionality
- great use
- works in IE 7+
- [__DEMO EXAMPLE__](http://source.858project.com/partialjs-clientside.html)

__MUST SEE:__

- [jQuery two way bindings](https://github.com/petersirka/jquery.bindings)
- [jQuery templating engine according to partial.js](https://github.com/petersirka/jquery.templates)
- [Web application framework for node.js - partial.js](https://github.com/petersirka/partial.js)

## Simple example

```js
// ===========================
// DEFINE ROUTING
// ===========================

// framework === global variable

framework.route('/homepage/', view_homepage, ['contact']);
framework.route('/services/', view_services, ['contact']);
framework.route('/contact/', view_contact, ['empty']);

// ===========================
// DEFINE PARTIAL CONTENT
// ===========================

framework.partial('contact', function() {
    $('#panel').html('CONTACT');
});

framework.partial('empty', function() {
    $('#panel').html('EMPTY');
});

// ===========================
// DEFINE VIEWS
// ===========================

function view_homepage() {
    $('#content').html('&lt;div style=&quot;color:#8CC152&quot;&gt;HOMEPAGE&lt;br /&gt;&lt;b&gt;Look into URL address bar&lt;/b&gt;.&lt;/div&gt;');
}

function view_services() {
    $('#content').html('&lt;div style=&quot;color:#3BAFDA&quot;&gt;SERVICES&lt;br /&gt;&lt;b&gt;Look into URL address bar&lt;/b&gt;.&lt;/div&gt;');
}

function view_contact() {
    $('#content').html('&lt;div style=&quot;color:#967ADC&quot;&gt;CONTACT&lt;br /&gt;&lt;b&gt;Look into URL address bar&lt;/b&gt;.&lt;/div&gt;');
}

// ===========================
// DEFINE EVENTS
// ===========================

framework.on('ready', function() {
    $('.menu').on('click', 'a', function(e) {
        e.preventDefault();
        e.stopPropagation();
        framework.redirect($(this).attr('href'));
    });
    framework.redirect('/homepage/');
});

framework.on('location', function(url) {
     var menu = $('.menu');
     menu.find('.selected').removeClass('selected');
     menu.find('a[href="' + url + '"]').parent().addClass('selected');
});
```

## Properties

#### framework.isModernBrowser;

> {Boolean} - Supports browser HistoryAPI?

#### framework.url;

> {String} - Current URL address.

```js
console.log(framework.url);
```

#### framework.version;

> {Number} - Current framework version.

```js
console.log(framework.version);
```

#### framework.history;

> {String Array} - History list (LIMIT_HISTORY === 100).

```js
console.log(framework.history);
```

#### framework.errors;

> {String Array} - Error list (LIMIT_HISTORY_ERROR === 100).

```js
console.log(framework.errors);
```

#### framework.global;

> {Empty object} - Temporary global object for storing a temporary data.

```js
framework.global.secret = 'AbcaDUIAZ349';
framework.global.name = 'partial.js';
```

#### framework.repository;

> {Empty Object} - Temporary object for the current location. After redirecting is the repository object cleared.

```js
framework.repository.title = 'partial.js title';
```

#### framework.model;

> {Object} - model for the current location.

```js
framework.redirect('/new-url/', { name: 'partial.js '});

// --> view

function view_new_url() {
	// this === framework
	var self = this;
	console.log(self.model);
}
```

#### framework.isReady;

> {Boolean} - Is framework ready??

```js
console.log(framework.isReady);
```

#### framework.isRefresh;

> {Boolean} - Is refresh?

```js
function view() {
	var self = this;
	// --> self.refresh();
	console.log(self.isRefresh);
}
```

#### framework.get;

> {Object} - Current (GET) params from URL address (url -> query). After redirect or refresh are params re-loaded.

```js
// ---> /current-page/?q=partial.js
console.log(framework.get.q);
```

## Methods

#### framework.route(path, fn, [partials], [once])

> Create a route.

```js
framework.route('/', view_homepage);
framework.route('/products/{category}/', view_products, ['latest']);
```

#### framework.partial(name, fn)

> Create a partial content

```js
framework.partial('latest', function() {
	console.log('latest products');
});
```

#### framework.redirect(url, [model])

> Redirect.

```js
framework.redirect('/products/shoes/');

// or

framework.redirect('/products/shoes/', { from: 'jeans', latest: true, custom: 'model' });
```

#### framework.back()

> History back.

```js
framework.back();
```

#### framework.refresh()

> Refresh current page.

```js
framework.refresh();
```

## Events

#### framework.on('ready')

> Is framework ready?

```js
framework.once('ready', funtion() {
	console.log('I\'m ready');
	framework.redirect('/homepage/');
});
```

#### framework.on('location')

> Capture a new location.

```js
framework.on('location', function(url) {
	console.log('new location --->', url);
});
```

#### framework.on('error')

> Capture an error.

```js
framework.on('error', function(error, url, description) {
	console.log('ERROR --->', error, url, description);
});
```

#### framework.on('status')

> Capture an HTTP status.

```js
framework.on('status', function(code, message) {

	switch (code) {
		case 404:
			console.log('NOT FOUND', message);
			break;
		case 500:
			console.log('INTERNAL ERROR', message);
			break;
	}

});
```