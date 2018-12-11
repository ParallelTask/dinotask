# DinoTask
DinoTask is built on top of HTML5 web-workers which provides an easy way of creating tasks that execute parallel in browser without blocking the UI thread.

## Usage
* Following HTML snippet blocks the UI Thread
```
<!doctype html>
<html>
    <head>
        <title>UI Freeze example</title>
    </head>
    <body>
        <button id="normal">Normal</button>
        <button id="uifreeze">CPU Intensive - UI Freeze</button>
    </div>
    <script>
        document.getElementById("normal").addEventListener("click", function () {
            console.log("Normal => I take less time to execute");
        });
        document.getElementById("uifreeze").addEventListener("click", function () {
            console.log("UI Freeze => I start the loop and takes 5 to 10 seconds to execute.");

            var startTime = new Date().getTime();
            for (var j = 0; j < 1500; j++) {
                for (var i = 0; i < 10000000; i++);
            }
            var endTime = new Date().getTime();
            console.log("UI Freeze => Total time in seconds: " + ((endTime - startTime) / 1000));
        });
    </script>
    </body>
</html>
```
With the above snippet, when you right click or left click your page or any button on the page, it will not respond since it is blocking UI thread.

* Following HTML snippet does not block the UI Thread
```
<!doctype html>
<html>
    <head>
        <title>UI Freeze example</title>
        <script src="DinoTask.js"></script>
    </head>
    <body>
        <button id="normal">Normal</button>
        <button id="uifreeze">CPU Intensive - UI Freeze</button>
    </div>
    <script>
        document.getElementById("normal").addEventListener("click", function () {
            console.log("Normal => I take less time to execute");
        });

        document.getElementById("uifreeze").addEventListener("click", function () {
            console.log("UI Responsive => I will start the loop and takes 5 to 10 seconds to execute.");

            DinoTask.create([], function () {
                var startTime = new Date().getTime();
                for (var j = 0; j < 1000; j++) {
                    for (var i = 0; i < 10000000; i++);
                }
                var endTime = new Date().getTime();
                return "UI Responsive => Total time in seconds: " + ((endTime - startTime) / 1000);

            }).run(function (result) {
                console.log(result);
            }).errorHandler(function (err) {
                console.log(err);
            });
        });
    </script>
    </body>
</html>
```
With the above snippet, when you right click or left click your page or any button on the page, it will still respond since it is non-blocking UI thread. (It offloads the computation to other thread).

## Download
CDN LINK - https://cdn.jsdelivr.net/npm/dinotask@0.0.1/dinotask.js
or you can download the file from `/dist` folder of github repository.
