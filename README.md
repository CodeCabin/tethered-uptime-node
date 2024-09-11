# Tethered - Uptime monitoring
Integrate Tethered into your NodeJS projects with our uptime monitoring. 

You can send custom metrics, log uptime internally and create incidents. 

## Requirements
Before getting started, you will need a [Tethered](https://tethered.app/) account, and your API key found within your [account information.](https://tethered.app/app/account)

You will also need a monitor setup, as this is required for automatic sync. This can be changed using a helper method, but in most cases your server would be linked to a specific monitor id. 

## Basic Usage
If you'd like to send system metrics automatically along with your uptime, this can be achieved with just a few lines of code:
```
const {Tethered} = require("tethered-uptime");

const uptime = new Tethered({apikey : "[APIKEY]", monitorId: 1});
```

This will setup an cron job (using cron module) which will send a status update and a list of system metrics over to Tethered to be processed. 

## Configuration Options

As part of our module constructor, you can pass a configuration object, as demonstrated in the **Basic Usage** example:
```
const uptime = new Tethered(configuration);
```

This object supports many options which you can use to change the way our module behaves. 

| Key | Type | Value |
|-----|------|-------|
| apikey       | string | Tethered API key, located in the account information section on tethered |
| monitorId    | int | The monitor id that you are sending data for, must be owned by the API key associated, can be changed after initialization using helper method |
| mode         | int | The default mode to run in, cron, interval or manual. See MODE_TYPES static variables, defaults to CRON  |
| syncFlags    | array(int) | The data types you'd like to send on sync. We recommend all (default), for machine monitors, and metrics only for other monitors like URL, PORT, etc. See SYNC_FLAGS static variable |
| metricFlags  | array(int) | The system resources you'd like to monitor, you can still send manual resources, but these are included by default, see static METRIC_FLAGS variable |
| cronTime     | string | If using cron mode, you can set a cron timing target, matching pattern structure from [cron](https://www.npmjs.com/package/cron). Defaults to hourly |
| cronTimezone | string | If using cron mode, you can alter the target timezone, defaults to "America/Los_Angeles" |
| intervalTime | int | If using interval mode, you can set the target interval, defaults to 3600 (hourly)  |
| modifiers    | object | If you need to mutate/add to our internal datasets you can use modifiers to listen for data and add/replace the dataset. Object of key/value pairs, where key is event name, and value is either a callable function or an array of callable functions (if chaining is needed)
| events       | object | If you need to listen for our internal events, you can pass your listeners in here as part of the init call. Object of key/value pairs, where key is event name, and value is either a callable function or an array of callable functions (if chaining is needed)
| logMode      | int | The log mode you want to use for the instance, defaults to disabled. See LOG_MODE static variable |
| logger       | function | If you have logMode set to "custom" you can pass a custom callback here to replace/funnel logs to your own logger instead  |

## Static Variables / Constants
Let's take a look at each of the available static variables which you can use as part of your configuration. 

| Primary | Secondary | Value |
|---------|-----------|-------|
| API_URL | | Our API URL | 
| API_VERSION | | Version of the API to use | 
| MODE_TYPES | | |
| | CRON | 1 - Cron mode, uses [cron](https://www.npmjs.com/package/cron) to send metrics at preferred timing |
| | INTERVAL | 2 - Interval mode, uses a traditional interval to send metrics at preferred interval timing | 
| | MANUAL | 3 - Disabled automatic sending, meaning you need to call "sync" and other methods as required. Useful for only logging custom metrics |
| SYNC_FLAGS | | | 
| | STATUS | 1 - Status sync |
| | METRICS | 2 - Metrics sync |
| METRIC_FLAGS | | |
| | CPU | 1 - CPU usage metrics | 
| | MEMORY | 2 - Memory usage metrics |
| | LOAD | 3 - General system load metrics | 
| | DRIVE | 4 - Drive capacity metrics | 
| LOG_MODES | | | 
| | DISABLED | 1 - No logging at all, default |
| | INTERNAL | 2 - Logged to internal instance variable named 'logs', which holds an array of all logs |
| | OUTPUT | 3 - Use default 'console.log' to output all logs |
| | CUSTOM | 4 - Custom logger enabled, use 'logger' configuration option to set a custom function to handle logs |

## Modifiers 
Using modifiers to alter the data sent to Tethered can be helpful, for example, if you'd like to send an additional resource statistic, but also want to optimize your usage of our API (where some rate limits apply), or simply want to include this data whenever our scheduler calls 'sync'. 

Let's take a look at how you might hook into the metrics list which is sent on 'sync' to include your own data:
```
const {Tethered} = require("tethered-uptime");

const uptime = new Tethered({
    apikey : "[APIKEY]", 
    monitorId: 1,
    modifiers : {
        "metrics.list" : [
            (list) => {
                list.push({
                    key : `custom_metric`,
                    value : Math.random() * 1000,
                    label : `Custom Metric`,
                    type : 'percentage',
                    widget : 'pie'
                });
                
                return list;
            }
        ]
    }
});
```
**Gotcha:** For this use case, you must apply your modifier in the configuration to ensure the custom data is included in the 'first' call which runs on init. 

However, there is another way to apply a modifier, which is more similar to traditional event listeners, in the example below, we'll change the 'status' code based on a custom condition: 
```
const {Tethered} = require("tethered-uptime");

const uptime = new Tethered({
    apikey : "[APIKEY]", 
    monitorId: 1
});

uptime.addModifier('status.code', (code) => {
    code = 403;
    return code;
});
```

### Modifiers Available
Here's a list of the currently available modifiers, along with the paramater type each of these will pass. These will likely be expanded with time. 

| Tag | Type | Description |
|-----|------|-------------|
| status.code | int | Part of 'pushStatus' method, represents a HTTP status code (Default: 200) |
| status.time | int | Part of 'pushStatus' method, represents time in milliseconds (Default: 0 ) | 
| metrics.list | array | Part of 'pushMetrics' method, represents all metrics that are about to be synced | 
| snapshot | object | Part of 'snapshot' method, represents the system resources, which are used in 'pushMetrics' | 
| request.options | object | Part of the 'request' method, represents the request options before the request is made | 

## Events 
Events mimic default event listener behaviour, in that you can listen for events that our module dispatches. These are different from modifiers as our module does not wait for or expect any response, meaning this is a one-way event. 

These can also be registered in two ways, in the same way as modifiers, so we will look at both of these now. 

Firstly, let's listen for the 'sync' event, by adding our listener directly to the configuration event. 
```
const {Tethered} = require("tethered-uptime");

const uptime = new Tethered({
    apikey : "[APIKEY]", 
    monitorId: 1, 
    events : {
        'sync' : [
            () => {
                console.log("Running sync call");
            }
        ]
    }
});
```
**Gotcha:** For this use case, you must apply your event listener in the configuration so that you also receive the first sync call trigger, which is run on init.

Now we'll take a look at listening for a specific response event, which runs when a status is logged successfully. This also includes the response object, and for demonstration purposes, we'll register this listener after initialization: 

```
const {Tethered} = require("tethered-uptime");

const uptime = new Tethered({
    apikey : "[APIKEY]", 
    monitorId: 1
});

uptime.listen('status.complete', (response) => {
    console.log("Status complete", response);
});
```

### Events Available
Here's a list of our available events, along with the type of data it will send, if any. These will likely be expanded with time. 

| Tag | Type | When |
|-----|------|-------------|
| ready | | After the instance initializes, if API key and monitor ID is set in the config (required config fields) |
| configured | object | Final step of our 'configure' method, after the configuration object is applied, before the 'ready' method |
| schedule.tick | | Scheduler runs, this would be on cron time, or interval time. Does not run in manual mode |
| sync | | During sync, alongside the push calls, meaning it does not wait for completion |
| status | | Before status is sent to the API |
| status.complete | object | After status has been sent to the API, passes the response object |
| metrics | | Before metrics are sent to the API, for both single or list |
| metrics.complete | object | After status has been sent to the API, passes the response object, for both single or list |
| monitors | | Before monitors are fetched from the API, requires a manual call, we don't use this method automatically |
| monitors.complete | object | After the monitors list has been returned by the API, passes the response from the API |
| incidents | | Before incidents are fetched from the API, requires a manual call, we don't use this method automatically |
| incidents.complete | object | After the incidents list has been returned by the API, passes the response from the API |
| incident | | Before an incident creation call is made to the API, requires a manual call, we don't use this method automatically |
| incident.complete | object | After an incident creation call has been made to the API, passes the response from the API |
| request | object | Before a request is made, not linked to any specific method, passes details about the request | 
| request.complete | object | after a request is made, passes the response from the API | 

## Methods
The following section will cover all of the methods available in the module. Some of these are specifically for internal use, and as such will not be demonstrated, as calling these is not suggested.

### configure(config)
Configures the module, as part of the constructor call. Configuration object is synced with an internal default and any passed modifiers and event listeners are registed. 

### setMonitor(id)
Allows you to adjust the active target monitor after initialization, if needed for multi-monitor management. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Set active monitor to ID 2
uptime.setMonitor(2);
```

### schedule() 
Set up the automatic scheduler system, based on configuration mode and timing options. This is automatically run as part of the initialization of the module. 

### sync() 
Automatically sends all data as controlled by configuration.syncFlags to the server, usually status and metrics. When using a scheduler mode, this will run at your preferred timing value, however, if you are manually controlling the send rate, you can call this manually. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Trigger the sync event
uptime.sync();
```

### pushStatus(code, time)
Push a new status code for your active monitor to the API. This is automatically called by the sync() method, but can also be called manually if needed.

Returns a Promise, which allows you to wait for the response if needed.

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Send status code 403 with timing of 112ms
uptime.pushStatus(403, 112)
    .then((response) => {
        console.log("Push complete", response)
    }).catch((error) => {
        console.log("Error", error);
    });
```

### pushMetric(key, value, label, type, widget)
Push a single metric for your active monitor to the API. This is not automatically called as we instead use the pushMetrics() method which pulls a snapshot of the system

Returns a Promise, which allows you to wait for the response if needed.

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Log a custom metric
uptime.pushMetric('custom_metric', (Math.random() * 1000), 'Custom Metric', 'percentage', 'pie')
    .then((response) => {
        console.log("Push complete", response)
    }).catch((error) => {
        console.log("Error", error);
    });
```

### pushMetrics()
Push all metrics, controlled by configuration.metricFlags, by using the snapshot method, to the API. This is automatically called by the sync method, but can also be called manually if needed.

Need to add a custom metric to this bulk push? Take a look at modifiers. 

Returns a Promise, which allows you to wait for the response if needed. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Log all metrics
uptime.pushMetrics()
    .then((response) => {
        console.log("Push complete", response)
    }).catch((error) => {
        console.log("Error", error);
    });
```

### getMonitors() 
Get your full monitor list from the API. This is not called automatically, and is a helper for you to use if needed. Results are not paginated, so bear this in mind. 

Returns a Promise, which allows you to wait for the response if needed. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Get monitors
uptime.getMonitors()
    .then((response) => {
        console.log("Fetch complete", response)
    }).catch((error) => {
        console.log("Error", error);
    });
```

### getIncidents(page) 
Get incidents linked to your account. This is not called automatically, and is a helper for you to use if needed. Results are paginated.

Returns a Promise, which allows you to wait for the response if needed. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Get incidents
uptime.getIncidents()
    .then((response) => {
        console.log("Fetch complete", response)
    }).catch((error) => {
        console.log("Error", error);
    });
```

### pushIncident
Create a new incident linked to your account, this will be linked to your active monitor. This is not called automatically, and is for you to use as needed

Returns a Promise, which allows you to wait for the response if needed. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Create an incident
uptime.pushIncident("Server issue", "NodeJS module is experiencing issues, with these details...", "NodeJS Module", 0)
    .then((response) => {
        console.log("Push complete", response)
    }).catch((error) => {
        console.log("Error", error);
    });
```

### snapshot()
Get a snapshot of the system resources. This is called during the sync call, if syncing metrics

Returns a Promise, which allows you to wait for the response if needed. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Get resource snapshot
uptime.snapshot()
    .then((snapshot) => {
        console.log("Snapshot", snapshot)
    }).catch((error) => {
        console.log("Error", error);
    });
```

### addModifier(tag, callable)
Add a modifier to the modifier list, linked to a specific tag (hook) with a callable function. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Add a modifier
uptime.addModifier('status.code', (code) => {
    code = 403
    return code;
});
```

### applyModifiers(tag, data)
Apply a modifier within the instance, this will call the tag and loop over any linked callables (chained) and allow each of them to mutate the data, before returning the final sample back to the module to be used. 

This is an internal method, we don't recommend using it outside of the module as it's for internal use, but it is theoretically possible to do so.

### listen(tag, callable)
Add an event listener to the module, linked to a specific tag (hook) with a callable function. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Add a listener
uptime.listen('schedule.tick', () => {
    console.log("scheduler is running");
});
```

### trigger(tag, data)
Trigger an event within the instance, this will call the tag and loop over any linked callables and send any packet data via the function call. This is a one way event, youn cannot return any data. 

This is an internal method, we don't recommend using it outside of the module as it's for internal use, but it is theoretically possible to do so.

### log(data)
Internal logging function, which sends the logs to your preferred logging method, although possible to use, this is for internal use specifically

### get(endpoint, data)
Perform a GET request to our API with the **endpoint** and **data** as required by the API. 

This will return a promise, and can be used to perform any API call that is not already supported by the helper methods. 

Remember that you do need to pass your API key as part of the data when calling directly. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Get notifiers linked to your account
const data = {apikey : uptime.configuration.apikey};
uptime.get('/notifiers')
    .then((response) => {
        console.log("Notifiers", response);
    }).catch((error) => {
        console.log("Error", error);
    });
```

### post(endpoint, data)
Perform a POST request to our API with the **endpoint** and **data** as required by the API. 

This will return a promise, and can be used to perform any API call that is not already supported by the helper methods. 

Remember that you do need to pass your API key as part of the data when calling directly. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Get notifiers linked to your account
const data = {apikey : uptime.configuration.apikey /* Notifier fields here... */};
uptime.post('/notifier')
    .then((response) => {
        console.log("Notifier", response);
    }).catch((error) => {
        console.log("Error", error);
    });
```

### delete(endpoint, data)
Perform a DELETE request to our API with the **endpoint** and **data** as required by the API. 

This will return a promise, and can be used to perform any API call that is not already supported by the helper methods. 

Remember that you do need to pass your API key as part of the data when calling directly. 

```
const {Tethered} = require("tethered-uptime");
const uptime = new Tethered(config);

// Get notifiers linked to your account
const data = {apikey : uptime.configuration.apikey, id : 1};
uptime.delete('/notifier')
    .then((response) => {
        console.log("Notifier", response);
    }).catch((error) => {
        console.log("Error", error);
    });
```

### request(endpoint, data, method)
Final request method, for internal use, and actually compiles the request before sending it to the API. 

You should use **get**, **post** or **delete** instead of calling this directly.


## API 
Remember that you can call any of our API endpoints, as long as you have access to that specific feature and are within your usage limits, using the get, post, and delete methods, this means that this module does allow for almost full account automation if that is something you need. 

You will need quite a comprehensive understanding of our API, but you can learn more about that in our [developer documentation](https://tethered.app/documentation/).