const os = require('os-utils');
const nodeDiskInfo = require('node-disk-info');
const { CronJob } = require('cron');

class TetheredUptime { 
    /* API details */
    static API_URL       = "https://tethered.app/app/api";
    static API_VERSION   = 1;

    /* Supported mode types  */
    static MODE_TYPES = {
        CRON     : 1,
        INTERVAL : 2,
        MANUAL   : 3
    };

    /* Supported sync flags, which will be dispatched when sync is called */
    static SYNC_FLAGS = {
        STATUS   : 1,
        METRICS  : 2
    }

    /* Supported resource flags we can monitor */
    static METRIC_FLAGS = {
        CPU      : 1,
        MEMORY   : 2,
        LOAD     : 3,
        DRIVE    : 4
    };

    /* Logging modes */
    static LOG_MODES = {
        DISABLED : 1,
        INTERNAL : 2,
        OUTPUT : 3,
        CUSTOM : 4
    }

    /**
     * Constructor
     * 
     * Initializes Tethered with a configuation object
     * 
     * @param object config Configuration options, which override the defaults if provided
     */
    constructor(config){
        this.configure(config);

        this.ready = false;
        if(this.configuration.apikey && this.configuration.monitorId){
            this.ready = true;
            this.trigger('ready');
            this.log("Configuration complete");
        } else {
            this.log("API key or monitor ID is missing from configuration");
        }

        this.schedule();
    }

    /**
     * Configure the instance with preferred runtime options 
     * 
     * Supported options: 
     * - apikey       : Tethered API key, located in the account information section on tethered
     * - monitorId    : The monitor id that you are sending data for, must be owned by the API key associated
     * - mode         : The default mode to run in, cron, interval or manual. See static variables 
     * - syncFlags    : The data types you'd like to send on sync. We recommend all, for machine monitors, and metrics only for other monitors like URL, PORT, etc
     * - metricFlags  : The system resources you'd like to monitor, you can still send manual resources, but these are included, see static variables
     * - cronTime     : If using cron mode, you can set a cron timing target
     * - cronTimezone : If using cron mode, you can alter the target timezone
     * - intervalTime : If using interval mode, you can set the target interval 
     * - modifiers    : If you need to mutate/add to our internal datasets you can use modifiers to listen for data and return your own. 
     *                  Object of key/value pairs, where key is event name, and value is either a callable function or an array of callable functions (if chaining is needed)
     * - events       : If you need to listen for our internal events, you can pass your listeners in here as part of the init call. 
     *                  Object of key/value pairs, where key is event name, and value is either a callable function or an array of callable functions (if chaining is needed)
     * - logMode      : The log mode you want to use for the instance, defaults to disabled. See log mode static variable
     * - logger       : If you have logMode set to "custom" you can pass a custom callback here to replace/funnel logs to your own logger instead 
     * 
     * Stores directly to instance, and keys must be predefined in the default configuration object
     * 
     * @param object config Configuration options, which override the defaults if provided
     * 
     * @return void
     */
    configure(config){
        this.logs = [];

        this.hooks = {
            modifiers : {},
            events : {}
        };

        this.configuration = {
            apikey        : false,
            monitorId    : 0,
            mode         : TetheredUptime.MODE_TYPES.CRON,
            syncFlags    : [TetheredUptime.SYNC_FLAGS.STATUS, TetheredUptime.SYNC_FLAGS.METRICS],
            metricFlags  : [TetheredUptime.METRIC_FLAGS.CPU, TetheredUptime.METRIC_FLAGS.MEMORY, TetheredUptime.METRIC_FLAGS.LOAD, TetheredUptime.METRIC_FLAGS.DRIVE],
            cronTime     : "0 * * * *",
            cronTimezone : "America/Los_Angeles",
            intervalTime : 3600,
            modifiers    : {},
            events       : {},
            logMode      : TetheredUptime.LOG_MODES.DISABLED,
            logger       : false
        };

        if(typeof config !== 'undefined' && config instanceof Object){
            for(let key in config){
                if(typeof this.configuration[key] !== 'undefined'){
                    if(key === 'events' || key === 'modifiers'){
                        /* Attempting to pre-link hooks as part of the initialization call */
                        if(config[key] instanceof Object){
                            for(let hookName in config[key]){
                                const hookValue = config[key][hookName];
                                if(typeof hookValue === 'function'){
                                    /* Single function passed, just add it to the list */
                                    switch(key){
                                        case 'modifiers':
                                            this.addModifier(hookName, hookValue);
                                            break;
                                        case 'events':
                                            this.listen(hookName, hookValue);
                                            break;
                                    }
                                } else if (hookValue instanceof Array){
                                    for(let hookCallable of hookValue){
                                        if(typeof hookCallable === 'function'){
                                            switch(key){
                                                case 'modifiers':
                                                    this.addModifier(hookName, hookCallable);
                                                    break;
                                                case 'events':
                                                    this.listen(hookName, hookCallable);
                                                    break;
                                            }
                                        }
                                    }
                                }
                            }
                        }


                    } else if((this.configuration[key] instanceof Object) && !(this.configuration[key] instanceof Array)){
                        /* Objects (that are not arrays), are replaced in steps */
                        if(config[key] instanceof Object){
                            for(let subKey in config[key]){
                                const subVal = config[key][subKey];
                                if(typeof this.configuration[key][subKey] !== 'undefined'){
                                    this.configuration[key][subKey] = subVal;
                                }
                            }
                        }
                    } else {
                        /* Arrays and standard keys are replaced */
                        this.configuration[key] = config[key];
                    }
                }
            }
        }

        this.trigger('configured', this.configuration);
    }

    /**
     * Set the primry monitor that you are running this instance for 
     * 
     * Usually, you'd set this at instance creation, but you can alter it later
     * 
     * @param number id The monitor id to target
     * 
     * @return void
     */
    setMonitor(id){
        if(this.ready){
            this.configuration.monitorId = parseInt(id);
        }
    }

    /**
     * Schedule the automated modes to run when expected
     * 
     * This will only run if you are using a mode which runs automatically, like cron or interval 
     * 
     * If you instead use manual mode, this will not do anything as there is no automation to be configured 
     * 
     * @return void
     */
    schedule(){
        if(this.ready) {
            if(this.configuration.mode === TetheredUptime.MODE_TYPES.CRON){
                const cronTime = this.configuration.cronTime || "0 * * * *";
                const cronTimezone = this.configuration.cronTimezone || "America/Los_Angeles";
                this._cron = new CronJob(
                    cronTime,
                    () => {
                        this.trigger('schedule.tick');
                        this.sync();
                    }, 
                    null,
                    true, 
                    cronTimezone
                );

                this.trigger('schedule.tick');
                this.sync();

                this.log(`Node cron scheduled to run at ${cronTime} (${cronTimezone})`);
            } else if(this.configuration.mode === TetheredUptime.MODE_TYPES.INTERVAL){
                const intervalTime = this.configuration.intervalTime || 3600;
                this._interval = setInterval(() => {
                    this.trigger('schedule.tick');
                    this.sync();
                }, intervalTime);

                this.trigger('schedule.tick');
                this.sync();

                this.log(`Interval scheduled to run at ${intervalTime}`);
            } else {
                this.log(`Skipping scheduling, in manual mode`);
            }
        }
    }

    /**
     * Sync all sync flags for the linked monitor
     * 
     * This will call the 'metrics' and 'status' methods, meaning both the uptime and system resources are synced 
     * 
     * You will still need to log any additional resources using our event triggers (see config), which allow you to hook into this sync method for your
     * own automation steps as/when needed
     * 
     * @return void
     */
    sync(){
        if(!this.ready){
            return;
        }

        if(this.configuration.syncFlags){
            if(this.configuration.syncFlags.includes(TetheredUptime.SYNC_FLAGS.STATUS)){
                /* Configured to send status updates */
                this.pushStatus().then(() => {}).catch(() => {});
            }

            if(this.configuration.syncFlags.includes(TetheredUptime.SYNC_FLAGS.METRICS)){
                /* Configured to send metrics */
                this.pushMetrics().then(() => {}).catch(() => {});
            }
        }

        this.trigger('sync');
    }

    /**
     * Send an uptime update via the API 
     * 
     * By default, it will be sent with a 200 status and a 0 time, but you can change these defaults with internal hooks 
     * 
     * @param int code The status code to log
     * @param int time The response/operation time to log
     * 
     * @return Promise
     */
    pushStatus(code, time){
        return new Promise((resolve, reject) => {
            if(this.ready){
                const data = {
                    apikey : this.configuration.apikey,
                    id : this.configuration.monitorId,
                    status : this.applyModifiers('status.code', code || 200),
                    time : this.applyModifiers('status.time', time || 0)
                };
        
                this.trigger('status');
        
                this.post('site/status', data).then((response) => {
                    this.log(`Status request completed (${response.status})`);
                    this.trigger('status.complete', response);

                    resolve(response);
                }).catch((error) => {
                    this.log(`Status request failed:`);
                    this.log(error);

                    reject(error);
                });
            } else {
                reject("Instance not ready");
            }
        });
        
    }

    /**
     * Log a custom metric to your site 
     * 
     * For one shot metrics users can call this one shot method instead of the automated metrics list method 
     * 
     * The alternative to this is to hook into the metrics methods instead and add to the list by returning additional metrics you want to log 
     * 
     * @param string key The key slug for this metric
     * @param number value The value of this metric
     * @param string label The pretty printed label for this metric. Suffix can be passed as a quick tag, for example "Memory {{}}MB" would set :"MB" to be the suffix
     * @param string|int type The type of metric you are storing. For example: counter, average, percentage etc
     * @param string|int widget The type of widget you want to use for storage. For example: line, area, pie, donut, radar, heatmap
     * 
     * @return Promise
     */
    pushMetric(key, value, label, type, widget){
        return new Promise((resolve, reject) => {
            if(this.ready){
                if(typeof key !== 'undefined' && typeof value !== 'undefined'){
                    const data = {
                        apikey : this.configuration.apikey,
                        site : this.configuration.monitorId,
                        key : key,
                        value : value
                    };
        
                    if(typeof label !== 'undefined'){
                        data.label = label;
                    }
        
                    if(typeof type !== 'undefined'){
                        data.type = type;
                    }
        
                    if(typeof widget !== 'undefined'){
                        data.widget = widget;
                    }
        
                    this.trigger('metrics');
                    
                    this.post('metrics/', data).then((response) => {
                        this.log(`Metrics request completed (${response.status})`);
                        this.trigger('metrics.complete', response);

                        resolve(response);
                    }).catch((error) => {
                        this.log(`Metrics request failed:`);
                        this.log(error);

                        reject(error);
                    });
                } else {
                    reject("Missing required fields 'key', 'value'");
                }
            } else {
                reject("Instance not ready");
            }
        });
    }

    /**
     * Get the current system resource usage data 
     * 
     * This will call the snapshot method, and then filter the returned data after the fact
     * 
     * Once received, send it via the API 
     * 
     * @return Promise
     */
    pushMetrics(){
        return new Promise((resolve, reject) => {
            if(this.ready){
                this.snapshot().then((system) => {
                    if(this.configuration.metricFlags){
                        let list = [];
                        
                        /* Check if CPU is enabled, and add it to the list */
                        if(this.configuration.metricFlags.includes(TetheredUptime.METRIC_FLAGS.CPU)){
                            if(typeof system.cpu !== 'undefined'){
                                list.push({
                                    key : 'cpu',
                                    value : system.cpu,
                                    label : 'CPU',
                                    type : 'percentage',
                                    widget : 'donut'
                                });
                            }
                        }
        
                        /* Check if memory is enabled, and add it to the list */
                        if(this.configuration.metricFlags.includes(TetheredUptime.METRIC_FLAGS.MEMORY)){
                            if(typeof system.memory !== 'undefined'){
                                list.push({
                                    key : 'memory',
                                    value : system.memory,
                                    label : 'Memory {{}}MB',
                                    type : 'average',
                                    widget : 'area'
                                });
                            }
                        }
        
                        /* Check if load is enabled, and add it to the list */
                        if(this.configuration.metricFlags.includes(TetheredUptime.METRIC_FLAGS.LOAD)){
                            if(typeof system.load !== 'undefined'){
                                list.push({
                                    key : 'load',
                                    value : system.load,
                                    label : 'System Load',
                                    type : 'percentage',
                                    widget : 'area'
                                });
                            }
                        }
        
                        /* Check if disk is enabled, and add it to the list */
                        if(this.configuration.metricFlags.includes(TetheredUptime.METRIC_FLAGS.DRIVE)){
                            if(typeof system.disks !== 'undefined'){
                                if(system.disks instanceof Array){
                                    for(let diskIndex in system.disks){
                                        const disk = system.disks[diskIndex];
        
                                        list.push({
                                            key : `disk_${diskIndex}`,
                                            value : disk.capacity,
                                            label : `Disk ${disk.name}`,
                                            type : 'percentage',
                                            widget : 'pie'
                                        });
                                    }
                                }
                            }
                        }
        
                        /* Allow the list to mutated in full */
                        list = this.applyModifiers('metrics.list', list);
        
                        if(list && list.length){
                            const data = {
                                apikey : this.configuration.apikey,
                                site : this.configuration.monitorId,
                                list : JSON.stringify(list)
                            };
        
                            this.trigger('metrics');
                            
                            this.post('metrics/', data).then((response) => {
                                this.log(`Metrics request completed (${response.status})`);
                                this.trigger('metrics.complete', response);

                                resolve(response);
                            }).catch((error) => {
                                this.log(`Metrics request failed:`);
                                this.log(error);

                                reject(error);
                            });
                        } else {
                            reject("No metric data to send");
                        }
                    } else {
                        reject("Configuration invalid, metric flags not defined correctly");
                    }
                }).catch((error) => {
                    this.log("System snapshot failed!");
                    this.reject(error);
                });
            } else {
                reject("Instance not ready");
            }
        });
    }

    /**
     * Get list of monitors linked to your account
     * 
     * This will include some surface level data, which might be helpful for determining your own internal actions
     * 
     * This does not return the data, but instead dispatches the data via an event 
     * 
     * @return Promise
     */
    getMonitors(){
        return new Promise((resolve, reject) => {
            if(this.ready){
                const data = {
                    apikey : this.configuration.apikey,
                };
        
                this.trigger('monitors');
        
                this.get('sites/', data).then((response) => {
                    this.log(`Monitors request completed (${response.status})`);
                    this.trigger('monitors.complete', response);

                    resolve(response);
                }).catch((error) => {
                    this.log(`Monitors request failed:`);
                    this.log(error);

                    reject(error);
                });
            } else {
                reject("Instance not ready");
            }
        });
    }

    /**
     * Get list of incidents linked to your account
     * 
     * This will return paginated results, meaning you can pass a page paramater
     * 
     * @param number page The page to be loaded, if left empty, will default to 1
     * 
     * @return Promise
     */
    getIncidents(page){
        return new Promise((resolve, reject) => {
            if(this.ready){
                page = typeof page === 'undefined' ? 1 : parseInt(page);

                const data = {
                    apikey : this.configuration.apikey,
                    page : page
                };
        
                this.trigger('incidents');
        
                this.get('incidents/', data).then((response) => {
                    this.log(`Incidents request completed (${response.status})`);
                    this.trigger('incidents.complete', response);

                    resolve(response);
                }).catch((error) => {
                    this.log(`Incidents request failed:`);
                    this.log(error);

                    reject(error);
                });
            } else {
                reject("Instance not ready");
            }
        });
    }

    /**
     * Create an incident
     * 
     * You can also update an incident, but for this, you should use the 'post' method and package the request yourself instead of using this helper
     * 
     * @param string title The title of the incident
     * @param string description The description of the incident
     * @param string source The source of the incident, for example "NodeJS Server". Will default to "api" if not set
     * @param number status The status to set this to, defaults to 0 (ongoing)
     */
    pushIncident(title, description, source, status){
        return new Promise((resolve, reject) => {
            if(this.ready){
                title = typeof title !== "undefined" ? title : false;
                description = typeof description !== "undefined" ? description : false;
                source = typeof source !== "undefined" ? source : false;
                status = typeof status !== "undefined" ? status : 0;
                
                if(title && description){
                    const data = {
                        apikey : this.configuration.apikey,
                        siteid : this.configuration.monitorId,
                        incident_title : title,
                        data_description : description
                    };

                    if(source){
                        data.incident_source = source;
                    }

                    if(status){
                        data.status = status;
                    }

                    this.trigger('incident');

                    this.post('incident/', data).then((response) => {
                        this.log(`Incident creation request completed (${response.status})`);
                        this.trigger('incident.complete', response);
    
                        resolve(response);
                    }).catch((error) => {
                        this.log(`Incident creation request failed:`);
                        this.log(error);

                        reject(error);
                    });
                } else {
                    reject("Missing required fields 'title', 'descripotion'");
                }
            } else {
                reject("Instance not ready");
            }
        });
    }

    /**
     * Snapshot system resources, to be sent via the API 
     * 
     * The promise will resolve with the current metric data, which is then filtered down by your preferred resource flags
     * 
     * @return Promise
     */
    snapshot(){
        return new Promise((resolve, reject) => {
            let snapshot = {
                memory : parseInt(os.totalmem()) - parseInt(os.freemem()),
                load : parseFloat((os.loadavg(1) * 100).toFixed(2)),
            }
            
            os.cpuUsage((cpuPercentage) => {
                snapshot.cpu = parseFloat((cpuPercentage * 100).toFixed(2));

                nodeDiskInfo.getDiskInfo().then((disks) => {
                    if(disks && disks.length){
                        snapshot.disks = [];
                        for(let disk of disks){
                            snapshot.disks.push({
                                name : disk.mounted.replace(":", ""),
                                capacity : parseInt(disk.capacity.replace("%", ""))
                            });
                        }
                    }
                    
                    snapshot = this.applyModifiers('snapshot', snapshot);
                    resolve(snapshot);
                }).catch((error) => {
                    snapshot = this.applyModifiers('snapshot', snapshot);
                    resolve(snapshot);
                })
            });
        });
    }

    /**
     * Register a modifiers to the instance
     * 
     * This allows additional extension or mutation of data before it is used by the instance 
     * 
     * Each instance is queued to the tag, meaning they can be stacked/chained together
     * 
     * @param string tag The event tag you want to hook into and modify packet data for
     * @param function callable The function/callable to send the data to, remember this callable must return the data back when called on
     * 
     * @return void
     */
    addModifier(tag, callable){
        if(this.hooks && this.hooks.modifiers){
            if(typeof this.hooks.modifiers[tag] === 'undefined' || !(this.hooks.modifiers[tag] instanceof Array)){
                this.hooks.modifiers[tag] = [];
            }

            if(typeof callable === 'function'){
                this.hooks.modifiers[tag].push(callable);
            }
        }
    }

    /**
     * Apply modifiers based on an event tag
     * 
     * This will loop over each registered modifier, call it and update the data packet, allowing chaining
     * 
     * Those callables MUST return the data as it will eventually end up back in the instance
     * 
     * @param string tag The event tag being processed
     * @param any data The data being processed, which can be altered by the callbacks in the queue
     * 
     * @return any
     */
    applyModifiers(tag, data){
        if(this.hooks && this.hooks.modifiers && this.hooks.modifiers[tag] && this.hooks.modifiers[tag] instanceof Array){
            for(let callable of this.hooks.modifiers[tag]){
                data = callable(data);
            }
        }
        return data;
    }

    /**
     * Register an event listener, which this instance will call 
     * 
     * Callable is linked to the tag, in a queue, meaning you can link multiple listeners to the same event 
     * 
     * These do not allow you to mutate/return data, in other words, it is a one-way event
     * 
     * If you need that, look at modifiers
     * 
     * @param string tag The event tag to listen for
     * @param function callable The callable to be run when the event is fired
     * 
     * @return void
     */
    listen(tag, callable){
        if(this.hooks && this.hooks.events){
            if(typeof this.hooks.events[tag] === 'undefined' || !(this.hooks.events[tag] instanceof Array)){
                this.hooks.events[tag] = [];
            }

            if(typeof callable === 'function'){
                this.hooks.events[tag].push(callable);
            }
        }
    }

    /**
     * Trigger an event internally within this instance 
     * 
     * This will fire off all of the registered event listeners, allowing implementations to take additional actions based on the instance events 
     * 
     * @param string tag The event tag to trigger
     * @param any data Any data to be sent to listeners 
     * 
     * @return void
     */
    trigger(tag, data){
        if(this.hooks && this.hooks.events && this.hooks.events[tag] && this.hooks.events[tag] instanceof Array){
            for(let callable of this.hooks.events[tag]){
                callable(data);
            }
        }
    }

    /**
     * Internal log method 
     * 
     * This is controlled by the logging mode of the instance, as mapped below: 
     * - Disabled : Nothing is logged, the method returns early
     * - Internal : Logs to a log variable in instance, which can be read at any time 
     * - Output : Uses the default console log method 
     * - Custom : If you have a logger callable passed, and it is callable, we'll send the data to that method instead
     * 
     * @param any data The data being logged, all types allowed
     * 
     * @return void
     */
    log(data){
        if(this.configuration && this.configuration.logMode){
            if(this.configuration.logMode === TetheredUptime.LOG_MODES.DISABLED){
                return;
            }

            if(typeof data === 'string'){
                data = `Tethered: ${data}`;
            }

            switch(this.configuration.logMode){
                case TetheredUptime.LOG_MODES.INTERNAL:
                    this.logs.push(data);
                    break;
                case TetheredUptime.LOG_MODES.OUTPUT:
                    console.log(data);
                    break;
                case TetheredUptime.LOG_MODES.CUSTOM:
                    if(this.configuration.logger && typeof this.configuration.logger === 'function'){
                        this.configuration.logger(data);
                    }
                    break;
            }
        }
    }
    
    /**
     * Make a GET request to the API 
     * 
     * @param string endpoint Target endpoint
     * @param object data Data to send to the endpoint, must include any needed auth details 
     * 
     * @return Promise
     */
    get(endpoint, data){
        return this.request(endpoint, data, "GET");
    }

    /**
     * Make a POST request to the API 
     * 
     * @param string endpoint Target endpoint
     * @param object data Data to send to the endpoint, must include any needed auth details 
     * 
     * @return Promise
     */
    post(endpoint, data){
        return this.request(endpoint, data, "POST");
    }

    /**
     * Make a DELETE request to the API 
     * 
     * @param string endpoint Target endpoint
     * @param object data Data to send to the endpoint, must include any needed auth details 
     * 
     * @return Promise
     */
    delete(endpoint, data){
        return this.request(endpoint, data, "DELETE");
    }

    /**
     * Make a request request to the API 
     * 
     * @param string endpoint Target endpoint
     * @param object data Data to send to the endpoint, must include any needed auth details
     * @param string method The method to use for this request 
     * 
     * @return Promise
     */
    request(endpoint, data, method){
        return new Promise((resolve, reject) => {
            const parts = [TetheredUptime.API_URL, `v${TetheredUptime.API_VERSION}`, endpoint];
            let url = parts.join('/');

            let options = {
                headers : {
                    "Content-Type" : "application/json"
                },
                method : method
            };

            if(typeof data !== 'undefined' && data instanceof Object){
                try{
                    switch(options.method){
                        case 'GET':
                        case 'DELETE':
                                let params = new URLSearchParams(data);
                                params = params.toString();
                                if(params && params.length){
                                    url += `?${params}`;
                                }
                            
                            break;
                        case 'POST':
                            const json = JSON.stringify(data);
                            options.body = json;
                            break;
                    }
                } catch(ex) {
                    /* Ignore it all */
                }
            }

            options = this.applyModifiers('request.options', options);
            this.trigger('request', { url : url, options : options, endpoint : endpoint });
            let status = 0;
            fetch(url, options).then((response) => {
                status = response.status || 0;
                return response.json();
            }).then((json) => {
                this.trigger('request.complete', {status : status, data : json});
                resolve({status : status, data : json});
            }).catch((error) => {
                reject(error);
            });
        });
    }
}

module.exports = {
    Tethered : TetheredUptime
};