export namespace main {
	
	export class CollaborationSession {
	    url: string;
	    urls: string[];
	    token: string;
	
	    static createFrom(source: any = {}) {
	        return new CollaborationSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.urls = source["urls"];
	        this.token = source["token"];
	    }
	}

}

