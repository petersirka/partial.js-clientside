# partial.js client-side routing

#### framework.route(path, fn, [partials], [once])

> Create a route.

```js
framework.route('/*', view_all);
framework.route('/', view_homepage);
framework.route('/products/{category}/', view_product, ['latest']);
```

#### framework.redirect(url, [model])

> Redirect.

```js
framework.redirect('/products/shoes/');

// or

framework.redirect('/products/shoes/', { from: 'jeans', latest: true, custom: 'model' });
```

#### framework.back()

> Back.

```js
framework.back();
```