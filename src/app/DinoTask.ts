interface IData {
    params?: any[];
}

interface IChildTask {
    result?: Function;
    emit?: Function;
    functions?: string;
}

interface IWorkerResponse {
    event?: any,
    data?: any,
    error?: boolean,
    stackTrace?: any
}

interface IUtility {
    isNullOrUndefined?(value: any): boolean;
    isFunction?(value: any): boolean;
    stringifyOnlyMethods?(value: any): string;
    getFunctionBody?(value: Function): string;
    getFunctionSignature?(value: Function): string;
    populateFunction?(value: Function, name: string): string;
    getTaskFunctionsFirstStatementsToInsert?(): string;
    getTaskFunctionsFinalStatementsToInsert?(): string;
}

interface IDinoTask {
    run?(cb: Function): void;
    addListener(cb: Function): IDinoTask;
    errorHandler(cb: Function): IDinoTask;
}

class DinoTask implements IDinoTask {

    private data: IData = {};
    private body: string = null;

    // container for the stringified version of DinoTask.functions property
    // which is populated on fly for the first task creation.
    // Note - Tasks created later on will be reusing the same stringified version, instead of creating again.
    private static taskBlockStringified: string;
    public static functions: any = {};
    private taskName: string;
    private listener: Function = (val: any) => { }
    private errHandler: Function = (val: any) => { }

    static utility: IUtility;


    // Its definition defined in Task.InitialTask method
    // used by child webworker only.
    // Task blocks must use `return Task.result(45)` instead of return 45 
    // for proper stack tracing inside web workers
    public static result = (val: any) => {
        return val;
    }

    // Its definition defined in Task.InitialTask method
    // used by child webworker only.
    public static emit = (val: any) => { };

    /**
     * Defines Initial-Task payload which generates the following script
     * consumed by chrome/firefox to create webworker script on the fly.
     *
     * `
     *  var DinoTask = {};
     *  var stackTrace = [];
     *  var _self = self;
     *  DinoTask.result = function(val){
     *      if (stackTrace.length > 0) { 
     *          stackTrace.pop(); 
     *      }
     *      return val;
     *  }
     *  DinoTask.emit = function(val){
     *      _self.postMessage({ parentXXXXXX: val });
     *  }
     *  DinoTask.functions = {[[block]]};`
     */
    private InitialTask(): void {

        let DinoTask: IChildTask = {};
        let stackTrace: string[] = [];
        let _self: Worker = self as any;

        DinoTask.result = (val: any) => {
            if (stackTrace.length > 0) {
                stackTrace.pop();
            }
            return val;
        };

        DinoTask.emit = (val: any) => {
            _self.postMessage({ PARENT_EMIT: val });
        }

        DinoTask.functions = '[[functions]]';
    }

    /**
     *  Replaces DinoTask.functions empty value with user defined DinoTask.functions value.
     *  DinoTask.functions = { slice : function(){}... };`
     *  @returns string
     */
    private getInitialTask(): string {

        if (DinoTask.utility.isNullOrUndefined(DinoTask.taskBlockStringified)) {
            // Task.functions contains methods added by end-user.
            let stringifiedFunctions = DinoTask.utility.stringifyOnlyMethods(DinoTask.functions);
            DinoTask.taskBlockStringified = DinoTask.utility
                .getFunctionBody(this.InitialTask)
                .replace('\'[[functions]]\'', stringifiedFunctions);
        }

        return DinoTask.taskBlockStringified;
    }

    /**
     * Gets Pre-Task Payload which returns the following script
     * `
     * var taskNameProvidedByUser = function(params){ ... };`
     * @returns string
     */
    private getPreTask(cb): string {
        return 'var ' + this.taskName + ' = ' + cb.toString() + ';';
    }

    /**
     * Gets the params to be injected in child web worker.
     * @returns params[0], params[1], params[2] ...
     */
    private getParamsToBeInjected(params: any[]): string {

        if (!DinoTask.utility.isNullOrUndefined(params) && params.length > 0) {
            let str = '';
            for (let i = 0; i < params.length; i++) {
                str += 'params[' + i + ']';
                if (i < (params.length - 1)) {
                    str += ', ';
                }
            }
            return str;
        }
        return '';
    }

    /**
     * Defines Post-Task payload which is responsible to generate the following script
     *
     * `
     *  var _self = self;
     *  _self.onerror = function(ev){
     *      _self.postMessage({ stackTraceXXXXXX: '[[stackTrace]]', event: err });
     *  }
     *  _self.onmessage = function(ev){
     *      
     *      var params = ev.data.params;
     *      var result = taskNameProvidedByUser(params);
     *      _self.postMessage(result);
     *  };`
     */
    private PostTask(): void {

        var _self: any = self as any;
        _self.onerror = (err) => { }
        _self.onmessage = (ev) => {
            let params = ev.data.params;
            let result = '[[name]]([[params]])';
            _self.postMessage(result);
        };
    }

    /** 
     * Gets Post-Task payload which returns the following script
     * `
     *  var _self = self;
     *  _self.onerror = function(ev){
     *      _self.postMessage({ stackTraceXXXXXX: '[[stackTrace]]', event: err });
     *  }
     *  _self.onmessage = function(ev){
     *      var params = ev.data.params;
     *      var result = taskNameProvidedByUser(params);
     *      _self.postMessage(result);
     *  };`
     *  @returns string
     */
    private getPostTask(param): string {

        var params = this.getParamsToBeInjected(param);
        var func = DinoTask.utility.getFunctionBody(this.PostTask);
        var body = func
            .replace('\'[[name]]', this.taskName)
            .replace('([[params]])\'', '(' + params + ')');
        return body;
    }

    /**
     * Creates a new Task that generates the below script
     *
     * `
     *  var DinoTask = {};
     *  var stackTrace = [];
     *  var _self = self;
     *  DinoTask.result = function(val){
     *      if (stackTrace.length > 0) { 
     *          stackTrace.pop(); 
     *      }
     *      return val;
     *  }
     *  DinoTask.emit = function(val){
     *      _self.postMessage({ parentXXXXXX: val });
     *  }
     *  DinoTask.functions = { slice : function(){}... };
     *  var taskNameProvidedByUser = function(params){ ... };
     *  var _self = self;
     *  _self.onerror = function(ev){
     *      _self.postMessage({ stackTraceXXXXXX: '[[stackTrace]]', event: err });
     *  }
     *  _self.onmessage = function(ev){
     *      var params = ev.data.params;
     *      var result = taskNameProvidedByUser(params);
     *      _self.postMessage(result);
     *  };
     * `
     * @param params[]
     * @param cb
     * @returns DinoTask
     */
    public static create(params: any[], cb: () => void, name?: string): IDinoTask {
        const task = new DinoTask();
        task.taskName = name || 'task_anonymous';
        task.data.params = params;
        task.body = task.getInitialTask() + task.getPreTask(cb) + task.getPostTask(params);

        return task;
    }

    /**
     * Sets up the listener to fire on DinoTask.emit().
     * @param cb
     * @returns DinoTask
     */
    public addListener(cb: Function): IDinoTask {
        this.listener = cb;
        return this;
    }

    /**
     * Sets up the listener to fire on unhandled child-worker error.
     * @param cb
     * @returns DinoTask
     */
    public errorHandler(cb: Function): IDinoTask {
        this.errHandler = cb;
        return this;
    }

    /**
     * Runs the DinoTask
     * @param cb
     */
    public run(cb: Function): IDinoTask {

        let url = window.URL.createObjectURL(new Blob([this.body], { type: "text/javascript" }));
        let worker = new Worker(url);

        worker.onmessage = (ev) => {
            // when PARENT_EMIT property is emitted then it means
            // child is communicating in chunk-model.
            if (!DinoTask.utility.isNullOrUndefined(ev.data.PARENT_EMIT)) {
                this.listener(ev.data.PARENT_EMIT);
            } else {
                worker.terminate();
                cb(ev.data, ev);
            }
        };

        worker.onerror = (ev) => {
            worker.terminate();
            this.errHandler(ev);
        }

        worker.postMessage(this.data);
        window.URL.revokeObjectURL(url);

        return this;
    }
}

// Defines utility methods consumed by DinoTask.
DinoTask.utility = {

    isNullOrUndefined: (value: any): boolean => {
        return value === undefined || value === null;
    },

    isFunction: (value: any): boolean => {
        return typeof value === 'function';
    },

    stringifyOnlyMethods: (value: any): string => {
        const keys = Object.keys(value);
        let str = '{';

        for (let i = 0; i < keys.length; i++) {
            if (DinoTask.utility.isFunction(value[keys[i]])) {
                str += keys[i] + ':' + DinoTask.utility.populateFunction(value[keys[i]], keys[i]);
            }
            if (i < (keys.length - 1)) {
                str += ', ';
            }
        }

        str += '}';
        return str;
    },

    populateFunction: (value: Function, name: string): string => {
        let body = DinoTask.utility.getFunctionBody(value);
        let funcSignature = DinoTask.utility.getFunctionSignature(value);
        let taskPreBody = DinoTask.utility
            .getTaskFunctionsFirstStatementsToInsert()
            .replace('[[taskBlock]]', name);
        let taskPostBody = DinoTask.utility.getTaskFunctionsFinalStatementsToInsert();
        let funcEnd = '}';

        let funcBody = funcSignature + taskPreBody + body + taskPostBody + funcEnd;

        return funcBody;
    },

    /**
     * Gets the statement to be inserted as first statement inside very task function
     */
    getTaskFunctionsFirstStatementsToInsert(): string {
        return 'stackTrace.push(\'[[taskBlock]]\');';
    },

    /**
     * Gets the statement to be inserted as last statement inside very task function
     */
    getTaskFunctionsFinalStatementsToInsert(): string {
        return '';
        // return ';stackTrace.pop();';
    },

    getFunctionBody: (value: Function): string => {
        let str = value.toString();
        return str.slice(str.indexOf("{") + 1, str.lastIndexOf("}"));
    },

    getFunctionSignature: (value: Function): string => {
        let func = value.toString();
        return func.slice(0, func.indexOf("{") + 1);
    }
};

// let app = DinoTask.create([4, 5], function () {

// }).run(function (result, ev) {
//     console.log(result);
// });
