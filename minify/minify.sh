ECHO "[COMPILING]"
cd ..
uglifyjs partial.js -o partial.min.js
cd minify
node minify.js ../partial.min.js