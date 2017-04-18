/*
Copyright 2017 Cycronix

WebScan V1.0 was developed under NASA Contract NAS4-00047 
and the U.S. Government retains certain rights.

Licensed under the Apache License, Version 2.0 (the "License"); 
you may not use this file except in compliance with the License. 
You may obtain a copy of the License at 

http://www.apache.org/licenses/LICENSE-2.0 

Unless required by applicable law or agreed to in writing, software 
distributed under the License is distributed on an "AS IS" BASIS, 
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
See the License for the specific language governing permissions and 
limitations under the License.
*/


/**
 * WebScan
 * Matt Miller, Cycronix
 * 02/2014 - 11/2016
 * 
 * v0.1: Initial prototype release
 * v0.5: Initial playback control buttons
 * v0.6: Drag screen to scroll time
 * V0.9: Save configuration
 * V1.0: rtSync tweeks, mDur RT lookback for sporadic sources
 * V1.0: webscan generics
 * V2.0: incorporate video/generic display objects...
 * V2.0A2:  add scroll bar, reorganize display
 * V2.0B1:	merged javascript files for easier delivery
 * V2.0B3:  support next/prev images
 * V2.0B4:  Tight scaling
 * V2.0B5:  Manual scaling
 * V2.0B6:  Improved popup Options menu
 * V2.0B6a: Reworked touch-controls for IE10/11 (disabled pointer syntax for now)
 * V2.0B7:  Bug fixes... better setTime logic
 * V2.0B8:  Tweaked RT display to fix data-gap potential, ...  Frozen at semi-stable version
 * V2.0B9:	Rework RT play (back) to be play-at-delay logic
 * V2.0B10:	Better wild-point rejection scaling for "Tight" scaling
 * V2.0:	Same as V2.0B10, production release
 * V3b1:	Rework controls/UI, add playRvs
 * V3b2-7:	Streamline, responsive UI, improved RT, image layers
 * V3.0:	Freeze V3b7 as release (11/23/2016)
 * V3.1:	Bug fixes, continued RT logic tweeks, improved text mode UI
 */

//----------------------------------------------------------------------------------------	
// globals of control variables
var myName="webscan";
//var servletRoot="/CT";			// "CT" works only for CTserver	
var servletRoot="/RBNB/";			// "/RBNB" or "/CT" ("RBNB" works for both CTserver and WebTurbine)
									// trailing slash important for DT/CORS (?!)
var serverAddr="";					// cross domain server...
//var serverAddr="";				// "" for local access

var tDelay=1000;					// initial data fetch interval (msec)
var doRate=true;					// set true to support UI rate selection
var maxLayer=4;						// max number of image layers

var debug=false;					// turn on some console.log prints
//var extraFetch=0.;

// some globals for callback functions
var channels = new Array();			// list of selectable channels (all plots)
var intervalID=0;					// timer id for start/stop
var intervalID2=0;					// timer id for start/stop (fast 10x rate)
var intervalID3=0;					// adaptive timer id
var noRebuild=false;				// defer rebuild during smartphone selections
var plots = new Array();			// array of plots
//var plotbox = new Array();			// array of plot-boxes (generic display)
var doFill=false;					// fill under-line
var doSmooth=true;					// smooth plot lines
//var refTime=null;					// refTime for fetch ("oldest", "newest", "absolute")
var inProgress=0;
//var LEtime=0;						// left edge (oldest) time
//var plotTime=0;						// master plot display time
var lastreqTime=0;					// right edge most recent request time
var lastgotTime=0;					// right edge (newest) time
var lastmediaTime=0;				// most recent fetched video time
var oldgotTime=0;					// left edge (oldest) time
var oldestTime=0;					// oldest available time (refTime="oldest")
var newgotTime=0;					// right edge (newest) time 
var newestTime=0;					// newest available time (refTime="newest")		(msec)
var stepDir=0;						// flag which way stepping
var refreshInProgress=false;		// flag full-refresh collection cycle
var isTouchSupported=false;
var singleStep=false;				// set based on RTrate/View ratio
var isImage=false;					// latest plot is image?
var numCol=0;						// numcols per plot row (0=auto)
var reScale=true;					// one shot rescale flag
var rtmode=1;						// real-time mode flag (rtmode==1 for latest play-RT MJM 8/24/16)
var playStr="&gt;";					// ">" play mode
var maxParam=10;					// max param per plot

var targetPlayDelay=10000;			// target play buffer for RT streaming (msec)
top.rtflag=0;						// RT state (for eavesdroppers)
top.plotTime=0;						// sec
top.plotDuration=0;					// sec

var PAUSE=0;						// play mode pseudo-constants
var RT=1;
var PLAY=2;

var scalingMode="Auto";				// scaling "Standard" (1-2-5) or "Tight" or "Auto" (Std increasing only) 

var gotTime = new Array();			// array of most recent got-times for each parameter
var lagTime = new Array();

var bufferStats = [];
var playStats = null;		// need to refresh on new RT

var setRT=false;				// boolean to set RT button state

//----------------------------------------------------------------------------------------
//webscan:  top level main method

function webscan(server) {
	if(server) serverAddr = server;
	if(debug) console.log('start');
	HTML5check();

	myName = window.location.host + window.location.pathname;		// store cookies unique to full URL path
//	console.debug("getCookie("+myName+"): "+getCookie(myName));
	
	if(!doRate) {
		document.getElementById("myUpdate").style.display = 'none';		// hide RTrate select
		document.getElementById("myUpdateLabel").style.display = 'none';		// hide RTrate select
		var dt = getURLValue('dt');
		if(dt != null) { tDelay=parseInt(dt); setConfig('dt',tDelay);	}
	}

	if(getURLValue('debug') == 'true')		 debug=true;
	if(getURLValue('reset') == 'true') 		 resetConfig();						// reset to defaults
	else if(getURLValue('reload') == 'true') { reloadConfig(); return; }		// use previous cookie-save
//	else if(getURLValue('n') == null) 		 { reloadConfig(); return; }		// default:  reload previous?
	else									 urlConfig();						// use url-params

	setTime(new Date().getTime());

	fetchChanList();					// build source select pull down
	if(plots.length == 0) setPlots(1);	// start with one empty plot
//	goEOF();							// end of file to start
	setPlay(PAUSE,0);					// Pause to start

	//refresh on resize after 1sec delay (avoid thrash)

	var timeOut=null;
	window.onresize = function() {
		if(timeOut != null) clearTimeout(timeOut);
		timeOut = setTimeout( function(){ rebuildPage(); },200); 
		setDivSize();		// redundant?
	};

	buildCharts();					// build  stripcharts
//	setTimeout(function(){buildCharts();}, 500); 	// rebuild after init? (for chartscan, complete channel lists)
	getLimits(1,1);					// establish time limits
//	goEOF();
	setTimeout(function(){ goBOF();}, 1000); 		// make sure data is shown at startup (was goBOF, 1000)

}

//----------------------------------------------------------------------------------------
// set div-heights dynamically so graphs fills space between title and control divs
function setDivSize() {
	var wrap=document.getElementById('wrapper').clientHeight;
	var ch=document.getElementById('dcontrols').clientHeight;
//	document.getElementById('dcontrols').style.bottom="0px";
	var top=document.getElementById('title').clientHeight;
	var bot=document.getElementById('dcontrols').offsetTop;
	document.getElementById('dgraphs').style.top = top+"px";
//	document.getElementById('dgraphs').style.bottom = ch+"px";
	document.getElementById('dgraphs').style.bottom=(wrap-bot)+"px";
}

//----------------------------------------------------------------------------------------
// HTML5check:  check for HTML5 browser

function HTML5check() {
	var test_canvas = document.createElement("canvas") //try and create sample canvas element
	var canvascheck=(test_canvas.getContext)? true : false //check support for getContext() canvas element method
	if(canvascheck==false) {
		alert("Warning: HTML5 Browser Required");
	}
}

//----------------------------------------------------------------------------------------
//GetURLValue:  get URL munge parameter

function getURLValue(key) {
//	var myurl = (window.location != window.parent.location) ? window.parent.location : window.location;
//	console.debug('url: '+myurl+', window.location: '+window.location+', substring: '+myurl.search.substring(1)+", key: "+key);
	return getURLParam(myURL().search.substring(1), key);
//	return getURLParam(window.location.search.substring(1), key);
}

function getURLParam(uri, key) {
	if(uri==null || typeof(uri)=='undefined') return null;
	var value=null;
	var VariableArray = uri.split(/[?&]+/);
	for(var i = 0; i < VariableArray.length; i++){
		var KeyValuePair = VariableArray[i].split('=');
		if(KeyValuePair[0] == key){
			value = unescape(KeyValuePair[1]);
		}
	}
//	if(value) console.log('getURLParam: key'+key+' = '+value+', uri: '+uri);
	return value;
}

// return URL of local window or parent window if embedded iframe
function myURL() {
	var myurl = (window.location != window.parent.location) ? window.parent.location : window.location;
	return window.location;			// just return iframe url to get params!
}

//----------------------------------------------------------------------------------------
//setURLParam:  update or add query string parameter to URL

function setURLParam(uri, key, value) {
	if((typeof value === 'string') && value == "") value = null;
//	if(!value || value=="") return uri;		// need for clearing param! e.g. p00
	var evalue = escape(''+value);
	if(uri==null) uri="";
	var newuri = uri;
	var re = new RegExp("([?|&])" + key + "=.*?(&|$)", "i");
	separator = uri.indexOf('?') !== -1 ? "&" : "?";
	if (uri.match(re)) 	{
		if(value == null)		newuri = uri.replace(re,'');		// was ,separator
		else					newuri = uri.replace(re, '$1' + key + "=" + evalue + '$2');
	} else if(value != null)	newuri = uri + separator + key + "=" + evalue;
//	console.log('setURLParam, uri: '+uri+', newuri: '+newuri+', key: '+key+', value: '+value);
	return newuri;
}

//----------------------------------------------------------------------------------------
//setCookie, getCookie:  W3C cookie setting with expiration

function clearCookies() {
    var cookies = document.cookie.split(";");

    for (var i = 0; i < cookies.length; i++) {
    	var cookie = cookies[i];
    	var eqPos = cookie.indexOf("=");
    	var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
    	document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
}

function setCookie(c_name,value,exdays)
{
	if(typeof(exdays)=='undefined') exdays=365;
	var exdate=new Date();
	exdate.setDate(exdate.getDate() + exdays);
	var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
	document.cookie=c_name + "=" + c_value;
}

function getCookie(c_name)
{
	var c_value = document.cookie;
	var c_start = c_value.indexOf(" " + c_name + "=");
	if (c_start == -1) c_start = c_value.indexOf(c_name + "=");
	if (c_start == -1) c_value = null;
	else {
		c_start = c_value.indexOf("=", c_start) + 1;
		var c_end = c_value.indexOf(";", c_start);
		if (c_end == -1) c_end = c_value.length;
		c_value = unescape(c_value.substring(c_start,c_end));
	}
	return c_value;
}

//----------------------------------------------------------------------------------------
//setConfig:  update configuration with key=value.  store in cookie.

function setConfig(key,value) {
//	console.log('setConfig, key: '+key+', value: '+value+', cookie: '+getCookie(myName));
	setCookie(myName, setURLParam(getCookie(myName),key,value),999999);
}

function getConfig(param) {
	var cookie = getCookie(myName);
	return getURLParam(cookie,param);
}

function reloadConfig() {
	stopRT();			// stop RT
	configParams(getCookie(myName));
	var url = myURL();
	var urlhref = url.protocol + '//' + url.host + url.pathname + getCookie(myName);
//	if(debug) console.debug('reloadConfig getCookie: '+getCookie(myName)+', myName: '+myName+', href: '+urlhref);

	url.href = urlhref		
}

function configParams(src) {
	var dt 		 = getURLParam(src,'dt');	if(dt != null) setRate(dt);						setConfig('dt',tDelay);
	var nplot 	 = getURLParam(src,'n');  	if(nplot != null) setPlots(parseInt(nplot));	else setConfig('n', nplot);
	var numcol 	 = getURLParam(src,'c');  	if(numcol != null) setCols(parseInt(numcol)); else numcol = 0;	setConfig('c', numCol);
	var fill 	 = getURLParam(src,'f');	setFill(fill=="true");							setConfig('f', fill=="true");
	var smooth 	 = getURLParam(src,'sm');	setSmooth(smooth=="true");						setConfig('sm', smooth=="true");		// was 's'
	var duration = getURLParam(src,'v');	if(duration != null) setDuration(duration);		else setConfig('v', duration);
	var scaling  = getURLParam(src,'sc');	if(scaling != null) setScaling(scaling);		setConfig('sc', scaling);
	var server   = getURLParam(src,'sv'); 	if(server != null) serverAddr = server;			setConfig('sv', serverAddr);

	if(serverAddr) 	document.getElementById("topbar").innerHTML = "WebScan : " + serverAddr;
	else			document.getElementById("topbar").innerHTML = "WebScan";
	
	// RT mode (one-shot param)
	var irtm  	 = getURLParam(src,'rt'); 	if(irtm!=null) rtmode=Number(irtm);
//	console.debug('configParams, tDelay: '+tDelay+", nplot: "+nplot+', rtmode: '+rtmode);
	
	for(var i=0; i<nplot; i++) {
		for(var j=0; j<maxParam; j++) {
			var chan = getURLParam(src,'p'+i+''+j);		
			setConfig('p'+i+''+j,chan);
//			console.debug('setconfig chan: '+chan);
			if(chan != null) plots[i].addParam(chan);
		}
	}
	setPlay(PAUSE,0);			// (re)start paused state
}

function urlConfig() {
	resetConfig();
	configParams(myURL().search.substring(1));
}

function resetConfig() {
	clearCookies();
	setCookie(myName,"",-1);
}

//----------------------------------------------------------------------------------------
// setRate:  initialize and set UI selection to match param

function setRate(dt) {
	tDelay = parseInt(dt);
	var el = document.getElementById('myUpdate');		// msec
	for(var i=0; i<el.options.length; i++) {
		if(dt == el.options[i].value) {		// enforce consistency
			el.options[i].selected=true;
			break;
		}
	}
}

//----------------------------------------------------------------------------------------
//setPlots:  initialize and create nplot plots

function setPlots(nplot) {
	if(nplot == plots.length) return;		// notta
	setConfig('n',nplot);

	if(nplot > plots.length) {
		for(var i=plots.length; i<nplot; i++) {
			plots.push(new plotbox({doFill:doFill,doSmooth:doSmooth}));
		}
	} else {
		for(var i=nplot; i<plots.length; i++) {
			if(plots[i]) plots[i].clear();		// clear charts (if defined, not on IE?)
			for(var j=0;j<maxParam;j++) setConfig('p'+i+''+j,null);		// remove from config
		}
		plots.splice(nplot,plots.length-nplot);					// rebuild list
	}
	var el = document.getElementById('nplot');
	for(var i=0; i<el.options.length; i++) {
		if(nplot == el.options[i].value) {		// enforce consistency
			el.options[i].selected=true;
			break;
		}
	}
}

//----------------------------------------------------------------------------------------
//setCols:  initialize numCols

function setCols(ncol) {
	numCol = ncol;
	var el = document.getElementById('Ncol');
	for(var i=0; i<el.options.length; i++) {
		if(ncol == el.options[i].value) {		// enforce consistency
			el.options[i].selected=true;
			break;
		}
	}
}

//----------------------------------------------------------------------------------------
//setScaling:  initialize scalingMode

function setScaling(scaling) {
//	scalingMode = "Standard";
	scalingMode = "Auto";
	if(scaling == 't') scalingMode = "Tight";
	else if(scaling == 'm') scalingMode = "Manual";
	else if(scaling == 'a') scalingMode = "Auto"
	var el = document.getElementById('myScaling');
	for(var i=0; i<el.options.length; i++) {
		if(scalingMode == el.options[i].value) {		// enforce consistency
			el.options[i].selected=true;
			break;
		}
	}
}

//----------------------------------------------------------------------------------------
//fetchData:  Use AJAX to fetch data

var refreshCount=0;	

function fetchData(param, plotidx, duration, time, refTime) {		// duration (msec)
	if((typeof(param) == 'undefined') || param == null) return;			// undefined
	
	// all setTime on display not fetch
//	if(refTime=="absolute") setTimeParam(time,param);			// set time slider to request fetch time (only here, plus RT fetch)
	
	if(debug) console.log('fetchData, param: '+param+', duration: '+duration+', time: '+time+", refTime: "+refTime);

//	if(inProgress >= 2) return;		// skip fetching if way behind?
	isImage = endsWith(param, ".jpg");	// this is a global, affects logic based on last-plot (still issue with mixed stripcharts/images)
	
	// audio with video: fetch as binary
	var isAudio = ((endsWith(param, ".pcm") || endsWith(param, ".mp3") || endsWith(param, ".wav")));			// FFMPEG s16sle, or MP3 audio
	
	// text type data
	var isText = endsWith(param, ".txt");
	
	if(!isImage && (refTime == "next" || refTime == "prev")) {				// no next/prev with stripcharts?
		refTime = "absolute";
	}
	
	var munge="";			// formulate the url munge params
	
	if(isAudio) {	
		munge = "?dt=b";						// binary fetch
//		if(refTime == "newest" || refTime == "after") 
			munge+="&refresh="+(new Date().getTime());		// no browser cache on newest

		if(endsWith(param,".wav")) munge += ("&d="+duration/1000.); else		// FOO try to get something to play in .wav format			
		munge += ("&d="+duration/1000.);		// rt playback presumes duration increment steps...
		
		if(refTime) munge += ("&r="+refTime);
		if(time < 0) time = 0;
		if(refTime!="newest" && refTime != "oldest") munge+=("&t="+time/1000.);		// no relative offsets
		
		var url = serverAddr + servletRoot+"/"+escape(param)+munge;
		setAudio(url, param, plotidx, duration, time, refTime);		// single fetch, setParamValue from binary
		return;
	}
		
	if(isImage || isText) {									
		munge = "?dt=b";						// binary fetch
		if(refTime) munge += ("&r="+refTime);
	} 
	else  {				
		munge = "?dt=s&f=b";
		munge += ("&d="+duration/1000.);
		if(refTime) { munge += ("&r="+refTime); }
		if(refTime == "absolute") lastreqTime = time + duration;		// right edge time (only update on stripcharts)
	}
	

	if(refTime == "absolute" || refTime == "next" || refTime == "prev" || refTime == "after") munge+=("&t="+time/1000.);
//	if(refTime != "absolute")
		munge+="&refresh="+(new Date().getTime());		// no browser cache on ANY non-absolute time call

	var url = serverAddr + servletRoot+"/"+escape(param)+munge;

	if(isImage) {
		plots[plotidx].display.setImage(url,param,plots[plotidx].params.indexOf(param));
	} else {	
		if(isText) 	AjaxGet(setParamText, url, arguments);
		else 		AjaxGet(setParamValue, url, arguments);		// 'arguments' javascript keyword
//		inProgress++;
	}
}

//----------------------------------------------------------------------------------------
// utility function
function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

//----------------------------------------------------------------------------------------
// setAudio:  make and play audio request

//var ascan = null;
//var audioContext = new (window.AudioContext || window.webkitAudioContext)();

function setAudio(url, param, plotidx, duration, time, refTime) {
//	if(inProgress>1) {
//		console.debug("inProgress: "+inProgress+", skipping audio fetch!!");
//		inProgress--;
//		return;
//	}
	if(debug) console.log("setAudio: "+url+", refTime: "+refTime);

	var audioRequest = new XMLHttpRequest();
	audioRequest.open('GET', url, true); 				//	open the request...
	audioRequest.responseType = 'arraybuffer';			// binary response
	
	var waveHdrLen = 0;
	if(endsWith(param,".wav")) waveHdrLen = 22;			// strip leading header if .wav format (size as int16 vals)
//	console.debug("waveHeader: "+waveHdrLen+", param: "+param);
	
	// TO DO:  consolidate this with AjaxGet logic (largely redundant)
    audioRequest.onreadystatechange = function () {
        if (audioRequest.readyState == 4) {
        	fetchActive(false);
        	if(inProgress>0) inProgress--;
			updateHeaderInfo(audioRequest, url, param);		// update header info, even on 404 not found error

			if(audioRequest.status==200) {
				if(audioRequest.response.byteLength > 1) {

					var buffer = new Int16Array(audioRequest.response);
					var nval = buffer.length - waveHdrLen;
					if(nval <= 0) {		// fire wall
						if(debug) console.warn("Warning: zero length audio!");
//						nval = 0;
//						if(inProgress > 0) inProgress--; 
						return;
					}
					
					var estRate = (buffer.length - waveHdrLen) / (duration/1000.);
					if(estRate > 10000) estRate = 22050;		// simple guess one of two rates
					else				estRate = 8000;

					var floats = new Array();
					floats.length = nval;						// init to length (faster)
					for(i=0, j=waveHdrLen; i<nval; i++,j++) floats[i] = buffer[j] / 32768.;
					
					// plot the data
					var hdur = audioRequest.getResponseHeader("duration");		
					if(hdur != null) 	duration = 1000 * Number(hdur);				// sec -> msec
					if(hdur != 0) setParamBinary(floats, url, param, plotidx, duration, gotTime[param], refTime);	
					
					// trim audio playback if sliding thru data (after plotting all of it!)
					if((top.rtflag==PAUSE) && ((nval / estRate) > 0.2)) {
						nval = 0.2 * estRate;		// limit audio snips to 0.2sec if manually scrolling
						if(debug) console.log("+++++got: "+buffer.length+", trimmed: "+nval+", nval/estRate: "+(nval/estRate));
						floats = floats.slice(0,nval);
					}	
					
					if(stepDir != -2) {
						// cluge for Safari, it won't play audio < 22050Hz, so upsample...
						var isSafari = navigator.vendor && navigator.vendor.indexOf('Apple') > -1 && navigator.userAgent && !navigator.userAgent.match('CriOS');
						if((isSafari || isIOS) && estRate < 22050) {
							var floats3 = new Array();
							floats3.length = 3*floats.length;		// initialize len (faster)
							for(j=0, k=0; j<nval; j++,k+=3) {
								floats3[k] = floats3[k+1] = floats3[k+2] = floats[j];
							}
							playPcmChunk(floats3, 3*estRate);		// no reverse-play audio
//							new audioscan().playPcmChunk(floats3, 3*estRate);		// no reverse-play audio
						}
						else {
//							new audioscan().playPcmChunk(floats, estRate);		// no reverse-play audio
							playPcmChunk(floats, estRate);		// no reverse-play audio
						}
					}
				}
//				else console.debug('invalid pcm audio response buffer');
			}
			else {		// ERROR Handling
				if(debug) console.warn('Error on audio fetch! '+url+', status: '+audioRequest.status);
				if(intervalID && singleStep) plots[plotidx].render(time);			// scroll plots if playing
				
				if(intervalID && audioRequest.status != 404) goPause();		// play thru gaps
				// setTime on request only
//				if(refTime=="absolute" && time>0) setTimeParam(time,param);			// move slider thru gaps
				
				inProgress=0;		// no deadlock
				if(intervalID) { 	//  no warn on shutdown
					if(top.rtflag==RT) return;
					else if(((time+duration) >= newestTime) || (audioRequest.status != 410 && audioRequest.status != 404)) {				// keep going (over gaps)
						if(debug) console.log('stopping on xmlhttp.status: '+audioRequest.status+", time: "+time+", newestTime: "+newestTime);
						goPause();	
					}
				}

			}
        }
    }
    
//    rtime = new Date().getTime();
	fetchActive(true);
	audioRequest.send();		// send the request
	inProgress++;
}

//----------------------------------------------------------------------------------------
//setParamValue:  set value on callback from Ajax 

function setParamValue(text, url, args) {
	var param = args[0];		// args passed thru == args of fetchData
	var pidx = args[1];
	var duration = args[2];
	var reqtime = args[3];	
	var refTime = args[4];
	var now=new Date().getTime();
	var time=now, value;
	var datavals = text.split("\n");
	datavals = datavals.filter(function(s) { return s.length > 0; } );
	var nval = datavals.length;		// presume last is blank?
	
//	inProgress--;
//	if(inProgress < 0) inProgress=0;		// failsafe
	
	if(plots[pidx] && (plots[pidx].type == "stripchart")) {
		if(duration >= getDuration() && top.rtflag==PAUSE) {
			if(debug) console.debug("setParamValue, clear line, top.rtflag: "+top.rtflag);
			plots[pidx].display.lines[param].clear();		// if full-refresh, clear old data
		}

		for(var i=0; i<nval; i++) {
			var timeval = datavals[i].split(",");
			ttime = 1000.*parseFloat(timeval[0]);					// sec -> msec (float)
			value = parseFloat(timeval[1]);

			if(isNaN(ttime)) continue;			// check for blank, bad time val
			else			 time = ttime;
			if(time < oldgotTime) oldgotTime=time;
			if(time > newgotTime) newgotTime=time;
			plots[pidx].addValue(param,time,value);
		}
	}
	else return;		// notta
	
//	if(debug) console.debug('plots['+pidx+'].nfetch: '+plots[pidx].nfetch);
//	if(singleStep && (param == plots[pidx].params[plots[pidx].params.length-1])) {			// last param this plot (can be out of order!?)
	
	if(singleStep && plots[pidx].nfetch==0  && top.rtflag!=PAUSE) {												// last param this plot by counter
		if(debug) console.debug('singleStep render, lastreqTime: '+lastreqTime+", tend: "+time);
		if(lastreqTime > 0) plots[pidx].render(lastreqTime);		// animation off, update incrementally
		else				plots[pidx].render(0);					// use last point got
	} 
	
//	if(inProgress == 0) document.body.style.cursor = 'default';

	if(nval > 0) {
		lastgotTime = time;
		if(refTime=="oldest") { 
//			setTime(time);	document.getElementById('TimeSelect').value=0; 	 	// all setTime on display not fetch 		
			if(oldgotTime<oldestTime && oldgotTime!=0) oldestTime=oldgotTime; 
		}	
		else if(refTime=="newest") { 
//			setTime(time);	document.getElementById('TimeSelect').value=100;  	// all setTime on display not fetch
			if(newgotTime>newestTime) newestTime=newgotTime; 
		}	
//		else if(refTime=="next" || refTime=="prev") setTime(time);				// all setTime on display not fetch

		gotTime[param] = time;
//		console.debug('setParamValue, newTime: '+newTime[param]);
	}
	
	if(debug) console.log("setParamValue url: "+url+", nval: "+nval+", lastgotTime: "+lastgotTime);
}

//----------------------------------------------------------------------------------------
//setParamText:  set text on callback from Ajax 

function setParamText(text, url, args, time) {
	var param = args[0];		// args passed thru == args of fetchData
	var pidx = args[1];
	
//	inProgress--;
//	if(inProgress < 0) inProgress=0;		// failsafe

	if(text.length > 0) {
		plots[pidx].setText(text);
		lastmediaTime = time;			// text is considered media (fastRT fetch)
//		updateTimeLimits(time);			// needed?
	}

	if(debug) console.log("GOT setParamText, url: "+url);
}

//----------------------------------------------------------------------------------------
// binary array fetch (Audio)
// note that timestamp is either from header (CT) or must be deduced from reqtime (DT)

function setParamBinary(values, url, param, pidx, duration, reqtime, refTime) {
	var now=new Date().getTime();
	var nval = values.length;		// presume last is blank?
	var dt = duration / values.length;		// deduce timestamps
	var time=reqtime;
	
	// presume time is what we asked for
	if(nval > 0) {
		lastgotTime = gotTime[param] = reqtime + duration;
	}
	if(debug) console.log("setParamBinary url: "+url+", nval: "+nval+", param: "+param+", paramTime: "+gotTime[param]);
	
	if(plots[pidx] && (plots[pidx].type == "stripchart")) {
		for(var i=0; i<nval; i++) {
			time = reqtime + i*dt;
			plots[pidx].addValue(param,time,values[i]);
		}
	}
	else 	return;		// notta

	if(debug) console.debug("setParamBinary, nval: "+nval+", over trange: "+duration+", dt: "+dt+', reqtime: '+reqtime+', refTime: '+refTime);
	
 		// done in refreshCollection? 
//	if(singleStep && (param == plots[pidx].params[plots[pidx].params.length-1]) && top.rtflag!=PAUSE) {			// last param this plot
	if(singleStep && plots[pidx].nfetch==0  && top.rtflag!=PAUSE) {												// last param this plot by counter
		if(debug) console.debug('singleStep render(binary), lastreqTime: '+lastreqTime+", tend: "+time);
//		plots[pidx].render(0);				// use last point got
		if(lastreqTime > 0) plots[pidx].render(lastreqTime);		// animation off, update incrementally
		else				plots[pidx].render(0);					// use last point got
	} 


//	if(nval > 0) {
//		var plot0=0;
//		lastgotTime = time;
//		console.debug('setParamBinary nval: '+nval+', lastgotTime: '+lastgotTime);
//		gotTime[param] = time;
//	}
}

//----------------------------------------------------------------------------------------
//rtCollection:  start real-time data collection

//async logic flow from here:
//rtCollection -> fetchData -> AjaxGet -> setParamValue

var playDelay=0;
var playStart=0;
var gotNewTime=0;		// for async playDelay update...
var skootch = 0;		// this hides right-side stripchart data gaps (was 1.5)

function rtCollection(time) {		// incoming time is from getTime(), = right-edge time
	stopRT();
	inProgress = 0;		// reset
	lastgotTime = 0;
	playStart = time;
	if(time != 0 && top.rtflag != RT) 
			playDelay = (new Date().getTime() - time);		// playback mode
//			playDelay = (new Date().getTime() - time - getDuration());		// playback mode, start at left-edge time to overlap display
//	else 	playDelay = 0.;
	else 	playDelay = (new Date().getTime() - newestTime);

	if(debug) console.debug('rtCollection, time: '+time+', playDelay: '+playDelay+', oldestTime: '+oldestTime+', getDuration: '+getDuration());
		
	// stripchart fetch data on interval
	gotTime = [];			// reset
	lagTime = [];
	bufferStats = [];
	playStats = null;	

	skootch = tDelay;		// init (was 2*tDelay)
	var tfetch = 0;
	var tright = 0;
	var pDur = getDuration();	// msec
	var numPlot = 0;		// keep track of number in-flight
	var numImage = 0;		// count images for inProgress check

	var rt_init = true;
	var anyplots=true;
	
	function doRT(dt) {
		if(dt==null) dt = tDelay;
		
		if(debug) console.debug('doRT! overflow? inProgress: '+inProgress+', numPlotted: '+numPlot);
		
		if(numPlot>0 && inProgress>=(numPlot+numImage)) {	// don't overwhelm!?
			console.warn("Not keeping up, skipping data request! inProgress: "+inProgress);
			intervalID = setTimeout(function() { doRT(dt); }, dt);		// reschedule
			return;
		}
		
		updatePauseDisplay(top.rtflag);
		tright = playTime(); // - skootch;				// right-edge time (skootched for lip-sync?)
/*		
		// global timing logic:
		var tleft = tright - pDur;							// left-edge time
		if(tleft > lastgotTime) tfetch = tleft;			// fetch from left-edge time
		else					tfetch = lastgotTime;	// unless already have some (gapless)		// this should be on per-param basis!!!!!
		var dfetch = 0.2*dt + tright - tfetch;			// very little extra (avoid audio overlap) was 0.1*
		if(debug) console.debug('1dfetch: '+dfetch+', dt: '+dt+', tfetch: '+tfetch+', tleft: '+tleft+', lastgotTime: '+lastgotTime+', tright: '+tright);
*/		
		if(!rt_init) {				// delay scrolling until SECOND time through for smooth startup
			for(var j=0; j<plots.length; j++) plots[j].start();			
		}
		
//		console.log("tfetch: "+tfetch+", newestTime: "+newestTime+", tright: "+tright+", top.rtflag: "+top.rtflag);
		// second or subsequent time in, bail if nothing to plot:
		if(!anyplots || ((tright>newestTime) && (top.rtflag!=RT) || top.rtflag==PAUSE) ) {		// keep rolling if rtmode!=0
			if(debug) console.log('EOF, stopping monitor.  tright: '+tright+', newestTime: '+newestTime);
			clearInterval(intervalID);		// notta to do
			intervalID = 0;
			if(intervalID2==0) goPause();
			return;
		}
		
		numPlot = 0;			// recalc
		anyplots = false;		// unless reset below
		for(var j=0; j<plots.length; j++) {
			var firstchan=true;
			for(var i=0; i<plots[j].params.length; i++) {
				var param = plots[j].params[i];
				if(endsWith(param,".jpg") || endsWith(param,".txt")) continue;

//				if(top.rtflag==RT && !anyplots) 				// adjust RT delay only for first chan, first plot as master
//					tright = adjustPlayDelay(tright, lagTime[param], dt);	// adjust playDelay (ptime = now-playDelay)
				
				// skootch adjust stripchart scrolling display with available data
				if(!anyplots) {		// adjust on first plot param
					// per-param tfetch-gapless logic:
					tfetch = tright - pDur;									// tleft
					if(gotTime[param] && tfetch<gotTime[param]) tfetch = gotTime[param];	// unless already have some (gapless)	
					dfetch = 0.5*dt + tright - tfetch;						// very little extra (avoid audio overlap) was 0.1*
//					plots[j].setDelay(playDelay+skootch);					// set smoothie plot delay (measured to right-edge of plot)
				}
				if(firstchan) plots[j].setDelay(playDelay+skootch);	// first chan each plot: set smoothie plot delay (right-edge of plot)

				// adjust RT delay AFTER data fetch (based on prior results)
				if(top.rtflag==RT && !anyplots) 				// adjust RT delay only for first chan, first plot as master
					tright = adjustPlayDelay(tright, lagTime[param], dt);	// adjust playDelay (ptime = now-playDelay)
			
				firstchan=false;
				anyplots=true;	
				if(debug) console.debug('fetchData tfetch: '+tfetch+', tright: '+tright+', dfetch: '+dfetch+', gotTime['+param+']: '+gotTime[param]);

				if(dfetch > 0) {
					fetchData(plots[j].params[i], j, dfetch, tfetch, "absolute");		// fetch latest data (async) 
					numPlot++;
					setTime(tright);						// global time set to right-edge of stripchart	
				}
			}
		}
		
		if(debug) console.debug("anyplots: "+anyplots+", tfetch: "+tfetch+", newestTime: "+newestTime+", top.rtflag: "+top.rtflag+', intervalID2: '+intervalID2);	
		rt_init = false;			// post - init		
		
		intervalID = setTimeout(function() { doRT(dt); }, dt);
	}
	
	mDur = getDuration();
	singleStep = false;					// initiate scrolling mode
	var dt = tDelay;
	if(dt > mDur) dt = mDur;			// refresh at least once per screen
	if(dt <= 100) dt = 100; 
	intervalID = intervalID2 = 1;		// so intervalID doesn't pause video before can check		

	for(var j=0; j<plots.length; j++) plots[j].dropdata();		// init?
	
	doRT(dt);		// startup without delay
//	intervalID = setInterval(function() {doRT(dt);}, dt);
	
	// ------------------------------ faster video updates:
	// video RT
	var prevmediaTime = 0;
	lastmediaTime = 0;			// reset
	var slowdownCount = 0;
	var fastDelay=tDelay/10;
	
	function doRTfast() {
		if(intervalID2==0 || top.rtflag==PAUSE) return;		// fail-safe
		
		if(numImage>0 && inProgress>=(numPlot+numImage)) {	// don't overwhelm!?
			console.warn("Video not keeping up, skipping request! inProgress: "+inProgress);
			intervalID2 = setTimeout(doRTfast,tDelay);		// reschedule
			return;
		}
		
		var ptime = playTime();	
		if(intervalID && tfetch && tright) ptime = ptime - (tright - tfetch);				// match stripchart delay?
		anyvideo = false;
		numImage = 0;			// recalc

		for(var j=0; j<plots.length; j++) {
			for(var i=0; i<plots[j].params.length; i++) {
				var param = plots[j].params[i];
				if(!param) continue;
				if(!endsWith(param,".jpg") && !endsWith(param,".txt")) continue;			// can have mixed .jpg & .wav params!
				anyvideo = true;
				
				if(top.rtflag==RT && intervalID==0) ptime = adjustPlayDelay(ptime, lagTime[param], fastDelay);		// defer to stripchart pacing if present

				if(debug) console.debug('RT fetch, param: '+param+', slowdownCount: '+slowdownCount+', ptime: '+ptime+', newestTime: '+newestTime+', intervalID: '+intervalID);
				if(endsWith(param,'.txt') && top.rtflag==RT)	fetchData(param, j, 0, 0, "newest");		// text:  always get newest if RT
				else											fetchData(param, j, 0, ptime, "absolute");	// RT->playback 
				
				numImage++;			
				if(intervalID == 0) setTime(ptime);				// all setTime on display not fetch
			}
		}
		
		if(!anyvideo || (ptime>=newestTime && (top.rtflag!=RT)) || top.rtflag==PAUSE) {	// keep rolling if RT
			if(debug) console.log('no video, stopping monitor');
			clearTimeout(intervalID2);		// notta to do
			intervalID2 = 0;
			if(intervalID==0) goPause();
		}
		else {
			// warning:  a successful fetch above may happen async such that a long wait below happens after first wake-up
			if(lastmediaTime > prevmediaTime) {
				slowdownCount=0;	
				intervalID2 = setTimeout(doRTfast,fastDelay);
			} else {
				slowdownCount++;				// ease up if not getting data
				if(debug) console.debug('slowdownCount: '+slowdownCount+', lastmediaTime: '+lastmediaTime+', prevmediaTime: '+prevmediaTime);
				if(slowdownCount < 100) 		intervalID2 = setTimeout(doRTfast,tDelay/10);	// <10s, keep going fast
				else if(slowdownCount < 150)	intervalID2 = setTimeout(doRTfast,tDelay);		// 10s to 1min
				else if(slowdownCount < 740)	intervalID2 = setTimeout(doRTfast,tDelay*2);	// 1min to ~10min
				else if(slowdownCount < 4000)	intervalID2 = setTimeout(doRTfast,tDelay*5);	// 10 min to ~2 hours
				else {
					intervalID2 = 0;
					if(intervalID==0) goPause();	// stop if long-time no data
				}
			}
			prevmediaTime = lastmediaTime;
		}
	}
	doRTfast();
}	

//----------------------------------------------------------------------------------------
// playTime:  offset from real-time clock to playback data
function playTime() {		// time at which to fetch (msec)	
	var now = new Date().getTime();
	var ptime = now - playDelay;					// playFwd
	if(debug) console.debug('playTime, now: '+now+', playDelay: '+playDelay+', playTime: '+ptime+", newestTime: "+newestTime);
	return ptime;
}

//----------------------------------------------------------------------------------------
// adjustPlayDelay:  try to figure out appropriate delay for "smooth" data display given variable data arrival time
function adjustPlayDelay(ptime, lagTime, dt) {
//	debug=true;
	
	if(!lagTime) {				// no lagTime from header, e.g. DataTurbine
		if(debug) console.warn('adjustPlayTime, no lagTime!');
		playDelay = 0;
		return playTime();
	}
	
	// Logic:
	// if play ahead of newest, fall back
	// figure expected max delay is avg + 3*std 
	// if play drops behind newest by more than expected max delay, catch up to expected max delay
	// While in this tolerance regime playback is smooth and new playback stats collected
	
	var mlagTime = lagTime * 1000;				// sec -> msec
	var playBuffer = newestTime - ptime;		// this is how much data buffer time on hand
	
	var targetPlayDelay = 1000 + mlagTime;
	targetPlayBuffer = 1000;
	if(bufferStats.length >= 5) {
		targetPlayDelay = playStats.mean + 3 * playStats.deviation;
		targetPlayBuffer = tDelay/2 + 3 * playStats.deviation;		// was 1000+, try tighter sync (200 OK locally, 500 less glitches?)
	}

	if(debug) 
		console.warn('adjustPlayDelay, playBuffer: '+playBuffer+', targetPlayBuffer: '+targetPlayBuffer+', playDelay: '+playDelay+', targetPlayDelay: '+targetPlayDelay);
	
	// if this can work without using lagTime, then immune from clock-sync to host
	if(playBuffer < 100) {				// play is ahead of newest, out of buffer				 
		var tplayDelay = -playBuffer + targetPlayBuffer;		// was +targetPlayDelay
		if(playDelay < tplayDelay) 	playDelay = tplayDelay
		else						playDelay += 20;			// force at least some fallback increase

		if(debug) console.debug('FALLBACK, playBuffer: '+playBuffer+', playDelay: '+playDelay+', mlagTime: '+mlagTime);
	}
	else {
//		if(playDelay > targetPlayDelay) {	// got spec playBuffer queued up.  (need to sweep multiple blocks to get good avg/std?)
		if(playBuffer > targetPlayBuffer) {	// got spec playBuffer queued up.  (need to sweep multiple blocks to get good avg/std?)

			var tback = playDelay - targetPlayDelay;
			if(tback > 60000) 	playDelay = targetPlayDelay;		// more than 1 minute, jump ahead... (was 10 minutes)
			else 
//				if(tback > 0) 	
					playDelay = (playDelay + targetPlayDelay) / 2;		// slew +/- playDelay in direction of targetPlayDelay
//			else 				playDelay = mlagTime;
//			else	playDelay -= 1000;

			if(debug) console.debug('CATCHUP, adjusted PlayDelay: '+ playDelay+', tback: '+tback);
		}
//		else {		// smooth sailing, collect stats
		// store queue of playBuffer (push, shift), then take avg + 3*stdDev as catchup target.
		bufferStats.push(mlagTime);			// is mlagTime reliable over network server?
		if(bufferStats.length >= 32) bufferStats.shift();			// was 100 length
		playStats = stdev(bufferStats);

		if(debug) console.debug('RUNNING, playBuffer: '+playBuffer+', playDelay: '+playDelay+', bufferStats.length: '+bufferStats.length+', playAvg: '+playStats.mean+', playStd: '+playStats.deviation);
	}

//	debug=false;
	return playTime();		// no update
}

//----------------------------------------------------------------------------------------
var stdev = function(arr) {
    var n = arr.length;
    var sum = 0;

    arr.map(function(data) {
        sum+=data;
    });

    var mean = sum / n;

    var variance = 0.0;
    var v1 = 0.0;
    var v2 = 0.0;
    var stddev = 0;
    
    if (n != 1) {
        for (var i = 0; i<n; i++) {
            v1 = v1 + (arr[i] - mean) * (arr[i] - mean);
            v2 = v2 + (arr[i] - mean);
        }

        v2 = v2 * v2 / n;
        variance = (v1 - v2) / (n-1);
        if (variance < 0) { variance = 0; }
        stddev = Math.sqrt(variance);
    }

    return {
        mean: Math.round(mean*100)/100,
        variance: variance,
        deviation: Math.round(stddev*100)/100
    };
};

//----------------------------------------------------------------------------------------
// waitDone:  wait until inProgress flag unset
// untested, not sure if this works!
function waitDone(maxWait) {
	if(inProgress && maxWait>0) { 	// wait til done
		setTimeout(function(){waitDone(--maxWait);}, 100); 
		return; 
	}
}

//----------------------------------------------------------------------------------------
//stepCollection:  step next/prev data (images only)

function stepCollection(iplot, time, refdir) {
	// find and step image with oldest time
	var idx= 0;
	var param=plots[iplot].params[idx];
	
	if(refdir == "next") {				// find oldest paramTime
		var otime=99999999999999;
		for(var j=0; j<plots.length; j++) {	
			for(var i=0; i<plots[j].params.length; i++) {
				var pname = plots[j].params[i];
				var t = gotTime[pname];
				if(t < 0) continue;		// out of action
				if(endsWith(pname, ".jpg") && t<otime) {
					idx = i;
					iplot = j;
					time = otime = t;
					param =  pname;
				}
			}
		}	
	}
	else {								// find newest paramTime
		var ntime=0;
		for(var j=0; j<plots.length; j++) {	
			for(var i=0; i<plots[j].params.length; i++) {
				var pname = plots[j].params[i];
				var t = gotTime[pname];
				if(t < 0) continue;		// out of action
				if(endsWith(pname, ".jpg") && t>ntime) {
					idx = i;
					iplot = j;
					time = ntime = t;
					param =  pname;
				}
			}
		}
	}
	
	var url = serverAddr + servletRoot+"/"+escape(plots[iplot].params[idx])+"?dt=b&t="+(time/1000.)+"&r="+refdir;
	plots[iplot].display.setImage(url,param,0);
	setTime(gotTime[param]);		// all setTime on display not fetch
}

//----------------------------------------------------------------------------------------
//refreshCollection:  refresh data, single step or continuous

function refreshCollection(onestep, time, fetchdur, reftime) {				// time is right-edge time
//	onestep=false for refilling plot and continuing with RT data 
	refreshInProgress=true;
	if(debug) console.log('refreshCollection: time: '+time+', reftime: '+reftime+', fetchdur: '+fetchdur+", onestep: "+onestep+', newestTime: '+newestTime);

	if(stepDir != -2) setPlay(PAUSE,0);								// pause RT
	refreshCollection2(100, onestep, time, fetchdur, reftime);		// fetch & restart after pause complete
}

function refreshCollection2(maxwait, onestep, time, fetchdur, reftime) {
	refreshInProgress=true;
	if(inProgress>0) { 		// wait til paused
		setTimeout(function(){refreshCollection2(--maxwait, onestep, time, fetchdur, reftime);}, 100); 
		return; 
	}	

	var duration = document.getElementById("myDuration");
	var fetchdur = 1000. * parseFloat(duration.options[duration.selectedIndex].value);
	if(resetMode) fetchDur=0;
	
	// check for going past EOF, BOF
	var now = new Date().getTime();
	oldgotTime = now;		// init
	newgotTime = 0;
	
	lastreqTime = 0;
	if(reftime == "absolute") {
//		lastreqTime = time + fetchdur;		// time=left-edge, lastreqTime=right-edge time
		lastreqTime = time;					// time=left-edge, lastreqTime=right-edge time

		if(debug) console.debug('get time: '+time+', oldestTime: '+oldestTime+', now: '+now+', lastreqTime: '+(lastreqTime)+', fetchdur: '+fetchdur+", reftime: "+reftime);
// don't auto-switch to newest/oldest, request time may be out of sync with system clock
//		if(lastreqTime > now) 		{ time = 0; reftime="newest"; lastreqTime=0; }
		if(lastreqTime > newestTime) 			{ time = 0; reftime="newest"; lastreqTime=0; }
		else if((time-fetchdur) < oldestTime) 	{ time = 0; reftime="oldest"; lastreqTime=0; }
		
		if(debug) console.debug('>>> time: '+time+', newestTime: '+newestTime+', now: '+now+', lastreqTime: '+(lastreqTime)+', fetchdur: '+fetchdur+", reftime: "+reftime);
	}

	if(onestep) {		// prefetch only if onestep?
		for(var j=0; j<plots.length; j++) {				// get data once each plot
			plots[j].dropdata();
			plots[j].nfetch=0;							// count how many to fetch so know when to render (MJM 12/2/16)
			for(var i=0; i<plots[j].params.length; i++) {
				var isMedia = endsWith(plots[j].params[i], ".jpg") || endsWith(plots[j].params[i], ".txt");
				var fetchd = fetchdur;
				if(isMedia) fetchd = 0;
//				console.debug('isMedia: '+isMedia+', plots['+j+'].params['+i+']: '+plots[j].params[i]+', fetchd: '+fetchd);
//				if(isMedia) fetchData(plots[j].params[i], j, fetchdur, time, reftime);			// fetch new data (async)
//				else 		
					fetchData(plots[j].params[i], j, fetchd, time-fetchd, reftime);	
			}	
		}	
	}
	refreshCollection3(100,onestep,time,fetchdur,reftime);		// queue restart
}

function refreshCollection3(maxwait, onestep, time, fetchdur, reftime) {
	if(inProgress>0) { 	// wait til done
		setTimeout(function(){refreshCollection3(--maxwait, onestep, time, fetchdur, reftime);}, 100); 
		return; 
	}	
	if(debug) console.log('refreshCollection3: reftime: '+reftime+", onestep: "+onestep);

	if(!resetMode) {
		if(onestep) {
//			/*		// done in setParamValue()
			for(var j=0; j<plots.length; j++) {
				if(debug) console.debug('refresh render: '+lastreqTime);
				plots[j].render(lastreqTime);	// see the data?
			}
//			*/
			if(lastreqTime) setTime(lastreqTime);		// all setTime on display not fetch
			if(reftime != "newest") updatePauseDisplay(PAUSE);
		}
		else {
			setPlay(RT,getTime());					// go (restarts RT collection + plots)
		}
	}
	
	refreshInProgress=false;
	resetMode=false;
	
	// force timeslider to show EOF:
	if(reftime=="newest" && newestTime!=0) setTime(newestTime);						// setTime is right-edge time
	if(reftime=="oldest" && oldestTime!=0) setTime(oldestTime+getDuration());	
	if(reftime=="oldest") setTimeSlider(oldestTime);		// ARGH make sure time slider is left

	if(setRT) {
		document.getElementById('play').innerHTML = 'RT';			//  catch button state here
		setRT = false;
	}
}

//----------------------------------------------------------------------------------------
//AjaxGet:  Ajax request helper func

function AjaxGet(myfunc, url, args) {
	if(args != null) {
		var param = args[0];
		var pidx = args[1];
		var duration = args[2];
		var time = args[3];
	}
	
	var xmlhttp=new XMLHttpRequest();

	xmlhttp.onreadystatechange=function() {

		if (xmlhttp.readyState==4) {
			if(inProgress>0) inProgress--;
	    	fetchActive(false);
	    	
			if(xmlhttp.status==200 || xmlhttp.status == 304) {
				if(debug) console.log("AjaxGet, url: "+url+', param: '+param);
				if(pidx!=null) plots[pidx].nfetch--;
				if(args != null) updateHeaderInfo(xmlhttp, url, param);				
				if(xmlhttp.status == 200) myfunc(xmlhttp.responseText, url, args, gotTime[param]);	
			}
			else {		// ERROR Handling
				if(debug) console.warn('Error on data fetch! '+url+', status: '+xmlhttp.status+", rtflag: "+top.rtflag);

				inProgress=0;		// no deadlock
				if(xmlhttp.status != 304) {							// keep going if dupes
					if(intervalID) { 	//  no warn on shutdown
						//console.log('stopping??? on xmlhttp.status: '+xmlhttp.status+", time: "+time+", newestTime: "+newestTime+", t>n: "+((time+duration)>=newestTime));
						if(top.rtflag==RT) return;
						else if(((time+duration) >= newestTime) || (xmlhttp.status != 410 && xmlhttp.status != 404)) {				// keep going (over gaps)
							if(debug) console.log('stopping on xmlhttp.status: '+xmlhttp.status+", time: "+time+", newestTime: "+newestTime);
							goPause();	
						}
//						setTimeParam(time,param);				// move slider thru gaps
					}
				}
			}
		}
	};
	xmlhttp.open("GET",url,true);	
	xmlhttp.onerror = function() { goPause();  /* alert('WebScan Request Failed (Server Down?)'); */ };		// quiet!
	if(gotTime[param] && duration==0.) 
		xmlhttp.setRequestHeader("If-None-Match", param+":"+Math.floor(gotTime[param]) );
	
	fetchActive(true);
	if(pidx!=null) plots[pidx].nfetch++;
	inProgress++;
	if(debug) console.debug('AjaxGet: '+url);
	
	xmlhttp.send();
}

//----------------------------------------------------------------------------------------	
//fetchChanList:  build channel list from DT source

function fetchChanList() {
	channels = new Array();
//	AjaxGet(parseWT,serverAddr+servletRoot,"chanList");
	AjaxGet(parseWT,serverAddr+servletRoot,null);
}

//----------------------------------------------------------------------------------------	
//parseWT:  parse links from WebTurbine HTML page

function parseWT(page,url,selel) {
	var el = document.createElement('div');
	el.innerHTML = page;
	var x = el.getElementsByTagName('a');
	for(var i=1; i<x.length; i++) {		// skip href[0]="..."
		var opt = x.item(i).textContent;	// not .text
		if(opt == '_Log/') continue;		// skip log text chans
		if(endsWith(opt, "/")) {
			AjaxGet(parseWT,url+"/"+opt,null);				// chase down multi-part names
		} else {										// Channel
			var fullchan = url+opt;
			fullchan = fullchan.substring(fullchan.indexOf(servletRoot)+servletRoot.length+1);
			fullchan = fullchan.split("//").join("/");		// replace any double-slash with single
			channels.push(fullchan);			// for plot selects
		}
	}

	if(channels.length > 0)	buildChanLists();   // inefficient, called multiple times per update...
}

//----------------------------------------------------------------------------------------
//endsWidth:  utility function 
function endsWith(str, suffix) {
	return str.toLowerCase().indexOf(suffix, str.length - suffix.length) !== -1;
}

//----------------------------------------------------------------------------------------
//durationSelect:  handle duration select

function durationSelect(cb) {
	setSingleStep();
	var secondsPerPlot = parseFloat(cb.options[cb.selectedIndex].value);
	for(var i=0; i<plots.length; i++) plots[i].setDuration(secondsPerPlot);

	if(top.rtflag==PAUSE && !isImage && oldestTime>0) {
		rePlay();
	}
	
	top.plotDuration = secondsPerPlot;		// global for eavesdroppers
	setConfig('v',secondsPerPlot);
}

function getDuration() {
	var duration = document.getElementById("myDuration");
	return 	1000.*duration.options[duration.selectedIndex].value;		// msec
}

function setDuration(spp) {		// seconds per plot
	var sel = document.getElementById("myDuration");
	for (var i=0; i<sel.options.length; i++) {
		if (sel.options[i].value == spp) {
			sel.selectedIndex = i;
		}
	}
	for(var i=0; i<plots.length; i++) plots[i].setDuration(spp);
	top.plotDuration = spp;		// global for eavesdroppers
}

//----------------------------------------------------------------------------------------
//updateSelect:  handle update-rate select

function updateSelect() {
	if(!doRate) return;
	var update = document.getElementById("myUpdate");
	update.onchange = function() {
		setSingleStep();
		tDelay = parseFloat(this.options[this.selectedIndex].value);
//		if(!isPause()) rtCollection(0);	
		setConfig('dt',tDelay);
	};
}

//----------------------------------------------------------------------------------------
//updateScaling:  handle update-scaling select

function scalingSelect(cb) {
	scalingMode = cb.options[cb.selectedIndex].value;
	if(scalingMode == "Tight") 			setConfig('sc','t');
	else if(scalingMode == "Manual") 	setConfig('sc','m');
	else if(scalingMode == "Auto") 		setConfig('sc','a');
	else								setConfig('sc','s');
	rebuildPage();
}

//----------------------------------------------------------------------------------------    
//nplotSelect:  onchange nplot select

function nplotSelect(cb) {
	nplot = cb.options[cb.selectedIndex].value;
	setPlots(nplot);
	noRebuild=false;		// no hang
	rebuildPage();
}

//----------------------------------------------------------------------------------------    
// serverSelect:  select data server address

function serverSelect(cb) {
	var x=document.getElementById("myServer");
//	console.debug('serverSelect: '+x.value);
	serverAddr = x.value;
	if(serverAddr.substring(0,3) != "http") serverAddr = "http://"+serverAddr;
}

//----------------------------------------------------------------------------------------    
//ncolSelect:  onchange ncol select

function ncolSelect(cb) {
	numCol = cb.options[cb.selectedIndex].value;
	setConfig('c',numCol);
	noRebuild=false;		// no hang
	rebuildPage();
}

//----------------------------------------------------------------------------------------	
//runStopUpdate:  pause operation

function runstopUpdate() {
	var paused = isPause();
//	if(debug) console.log('runstopUpdate');
	if(paused) setPlay(PAUSE,0);
	else {
		setPlay(RT,0);
		refreshCollection(false,0,getDuration(),"newest");		// update plots
	}
}

//----------------------------------------------------------------------------------------	
//setPlay:  0=pause, 1=RT, 2=playback

function setPlay(mode, time) {
	top.rtflag = mode;				
	setSingleStep();
	if(debug) console.debug('setPlay: mode: '+mode+', time: '+time+', singleStep: '+singleStep);
		
	if(mode==PAUSE) {				// stop RT
		stopRT();
		inProgress=0;			// make sure not spinning
//		document.body.style.cursor = 'default';		
		document.getElementById('play').innerHTML = playStr;
		setDivSize();			// resize divs on pause
	}
	else {
		if(debug) console.debug('starting plots, singlestep: '+singleStep);
		rtCollection(time);
		document.getElementById('play').innerHTML = '||';
	}

	updatePauseDisplay(mode);
}

function getPlayMode() {
	return top.rtflag;
}

function updatePauseDisplay(mode) {
	fetchActive(false);

	if(stepDir == -2) 		document.getElementById('<').checked=true;
	else if(mode==PAUSE){
		document.getElementById('play').innerHTML = playStr;
		document.getElementById('play').checked = true;
		if(document.getElementById('RT')) document.getElementById('RT').checked=false;
	}
	else if(mode==RT && rtmode==0) 	{
		if(document.getElementById('RT')) document.getElementById('RT').checked=true;
		document.getElementById('play').checked = false;
	}
	else if(mode==PLAY) {
		document.getElementById('play').innerHTML="||";
		document.getElementById('play').checked = true;
		if(document.getElementById('RT')) document.getElementById('RT').checked=false;
	}
}

//----------------------------------------------------------------------------------------	
//rePlay:  re-start at current time & mode (pause/play/RT)

function rePlay() {
	var mode = PAUSE;
	if(rtmode==0 && document.getElementById('RT') && document.getElementById('RT').checked) mode = RT;
	else if(document.getElementById('play').innerHTML=="||") mode = PLAY;

	if(mode==PAUSE && !isImage && oldestTime > 0) {
//		refreshCollection(true,getTime()+getDuration(),getDuration(),"absolute");	// auto-refill plots to full duration?? (time is right-edge!)
		refreshCollection(true,getTime(),getDuration(),"absolute");		// auto-refill plots to full duration?? (getTime is right-edge!)
	}
	else if(mode==PLAY) {
		playFwd();
	}
	else if(mode==RT) {
		refreshCollection(false,0,getDuration(),"newest");	// this auto-fills now			
	}
}

//----------------------------------------------------------------------------------------	
//stopRT:  clear RT timer

function stopRT() {
	if(debug) console.log("stopRT. playStr: "+playStr);
	if(intervalID != 0) clearInterval(intervalID);
	if(intervalID2 != 0) clearTimeout(intervalID2);
	intervalID = intervalID2 = 0;
	if(intervalID3 != 0) clearTimeout(intervalID3);		// turn off playRvs timer (only) here
	intervalID3=0;
	for(var i=0; i<plots.length; i++) plots[i].stop(); 
	document.getElementById('play').innerHTML = playStr;
	singleStep = true;		// mjm 7/30/15
}

//----------------------------------------------------------------------------------------	
//setSingleStep:  set flag if small incremental view update (more efficient)

function setSingleStep() {
	if(stepDir< 0) 	singleStep = true;
	else			singleStep = false; // default
	return;					// nah
	
//	if(stepDir > 1) { singleStep = false; return; }		// playback mode animation always
	var update = document.getElementById("myUpdate");
	var updateInterval = parseFloat(update.options[update.selectedIndex].value)/1000.;		// sec
	var duration  = document.getElementById("myDuration");
	var viewDuration = parseFloat(duration.options[duration.selectedIndex].value);
	var ratio = updateInterval / viewDuration;
	
	if(ratio < 0.001) singleStep = true;		// e.g. 1sec updates at 10 min => ratio 0.0016
	if(duration <= 0.1) singleStep = true;
}

//----------------------------------------------------------------------------------------	
//isPause:  return true if paused

function isPause() {
	return 	document.getElementById('play').innerHTML==playStr;
}

//----------------------------------------------------------------------------------------	
//isRT:  true/false if in pause state

function isRT() {
	return !document.getElementById('play').innerHTML==playStr;
}

//----------------------------------------------------------------------------------------	
//smoothCheck:  set/unset smooth option

function smoothCheck(cb) {
	if(cb) doSmooth = cb.checked;
	for(var i=0; i<plots.length; i++) { 
		plots[i].setSmooth(doSmooth); plots[i].render(lastreqTime); 
	}
	setConfig('sm',doSmooth);
}  

function setSmooth(smooth) {
	doSmooth = smooth;
	cb = document.getElementById('smooth');
	cb.checked = smooth;
	for(var i=0; i<plots.length; i++) plots[i].setSmooth(doSmooth); 
}

//----------------------------------------------------------------------------------------	
//fillCheck:  set/unset fill option

function fillCheck(cb) {

	if(cb) doFill = cb.checked;
	for(var i=0; i<plots.length; i++) { 
		plots[i].setFill(doFill); plots[i].render(lastreqTime); 
	}
	setConfig('f',doFill);
} 

function setFill(fill) {
	doFill = fill;
	cb = document.getElementById('fill');
	cb.checked = fill; 
	for(var i=0; i<plots.length; i++) plots[i].setFill(doFill); 
}

//----------------------------------------------------------------------------------------
//resetParams:  set variables to match UI values (needed for FireFox refresh)

function resetParams() {
	var el = document.getElementById('nplot');
	var nplot = el.options[el.selectedIndex].value;
	if(nplot != plots.length) setPlots(nplot);

	var doSmooth = document.getElementById('smooth').checked;
	var doFill = document.getElementById('fill').checked;

	for(var i=0; i<plots.length; i++) { 
		plots[i].setFill(doFill); 
		plots[i].setSmooth(doSmooth);
	}

	if(doRate) {
		var update = document.getElementById("myUpdate");		// msec
		tDelay = parseFloat(update.options[update.selectedIndex].value);
	}
}

//----------------------------------------------------------------------------------------
// show status of data-fetch

function fetchActive(status) {
//	console.debug('fetchActive: '+status);
	if(status) 	{
		document.getElementById("timestamp").style.color = "red";
		document.body.style.cursor = 'wait';
	} else {
		document.body.style.cursor = 'default';
		document.getElementById("timestamp").style.color = "white";
	}
}

//----------------------------------------------------------------------------------------
//rebuildPage:  reconstruct and restart data collection 

function rebuildPageWait(maxWait) {
	if((inProgress>0 || refreshInProgress) && maxWait>0) { 						// wait til prior update done
//		console.debug('inProgress: '+inProgress+', refreshInProgress: '+refreshInProgress);
		setTimeout(function(){rebuildPageWait(--maxWait);}, 100); 
		return; 
	}
	rebuildPage();
}

function rebuildPage() {
	if(noRebuild) return;								// notta
	if(debug) console.log('rebuildPage!');
	
	stopRT();
	buildCharts();
	resetParams();						// ensure buttons match parameter values
	stopRT();		// ??

	setTimeout(function(){ rebuildPage2(20); }, 1000);					// finish rebuild with wait for buildCharts()
}

function rebuildPage2(maxWait) {
	if((inProgress>0 || refreshInProgress) && maxWait>0) { 						// wait til prior update done
		setTimeout(function(){rebuildPage2(--maxWait);}, 100); 
		return; 
	}
	
	if(getTime()<oldestTime) setTime(oldestTime);			// sanity/initialization checks
	if(getTime()>newestTime) setTime(oldestTime);
	
	if((getTime()<oldestTime || getTime()>newestTime) && oldestTime != 0) {
//		setTime(oldestTime+getDuration());
		refreshCollection(true,0,getDuration(),"oldest");
	}
	else refreshCollection(true,getTime(),getDuration(),"absolute");	// auto-refill plots to full duration (time is right-edge!)
	
	if(!isPause()) 	goRT();
}

//----------------------------------------------------------------------------------------
//setTime:  update screen display of current time position

function setTimeNoSlider(time) {
	if(time == 0 || isNaN(time)) return;		// uninitialized
	
	var month = new Array();
	month[0] = "Jan";	month[1] = "Feb";	month[2] = "Mar";	month[3] = "Apr";	month[4] = "May";	month[5] = "Jun";
	month[6] = "Jul";	month[7] = "Aug";	month[8] = "Sep";	month[9] = "Oct";	month[10] = "Nov";	month[11] = "Dec";
	
	d = new Date(time);		// msec
	var dstring = ("0"+d.getDate()).slice(-2) + " " + month[d.getMonth()] + " " + 
    d.getFullYear() + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2);
	
	var cb = document.getElementById('myDuration');
	var durString = cb.options[cb.selectedIndex].text;

	var rtString = "";
	if(top.rtflag==RT && playDelay!=0) {
		if(playDelay > 0) 	rtString = "   [RT-" + (playDelay/1000).toFixed(1)+"s]";
		else				rtString = "   [RT+" + (-playDelay/1000).toFixed(1)+"s]";
	}
	document.getElementById("timestamp").innerHTML = dstring + ' (' + durString + ')' + rtString;
	top.plotTime = time / 1000.;		// global, units=sec
	
	if(debug) console.debug('setTimeNoSlider: '+time);
}

function setTimeParam(time, param) {
	// all setTime on display not fetch
//	if(plots[0].params.length==0 || param==plots[0].params[0]) setTime(time);
}

// sets "current" time, left-edge time on stripcharts
function setTime(time) {	
	if(debug) console.debug('setTime: '+time+', oldestTime: '+oldestTime+', newestTime: '+newestTime);
//	console.trace();
	if(time == 0 || isNaN(time)) return;		// uninitialized
	setTimeNoSlider(time);
	
	// set time slider
	setTimeSlider(time);		
}

function setTimeSlider(time) {	
	var el = document.getElementById('TimeSelect');
	if(newestTime == 0 || oldestTime == 0) {   			// failsafe	
		if(debug) console.log("WARNING:  setTimeSlider without limits, newestTime: "+newestTime+", oldestTime: "+oldestTime);
		el.value = 0;
		return;
	}
	var mDur = 0.;
//	if(!isImage) 					// isImage unreliable global, async.  try always adjust
		mDur = getDuration();		// duration msec	
		
	var percent=0;
	if(mDur > (newestTime-oldestTime)) {
		percent = 100.;
	} else {
		if(time==oldestTime) 		percent = 0;
		else if(time==newestTime) 	percent = 100;
		else 						percent = 100. * (time - oldestTime - mDur) / (newestTime - oldestTime - mDur);
	}
	
	if(debug) console.debug('setTimeSlider, time: '+time+", percent: "+percent+', oldestTime: '+oldestTime+', newestTime: '+newestTime+', mDur: '+mDur);		
	el.value = percent;
}

function getTime() {
//	console.debug('getTime: '+top.plotTime);
	return top.plotTime * 1000.;		//  msec
}

var lastSet=0;
function timeSelect(el) {
//	console.debug("timeSelect, inProgress: "+inProgress);
	if(inProgress>0) return;
	var now = new Date().getTime();
	if((now - lastSet) < 100) return;			// ease up if busy
	lastSet = now;
	goTime(el.value);
//	console.debug("timeSelect: "+value);
}

function updateTimeLimits(time) {
	if(debug) console.log("updateTimeLimits: "+time);
	if(time <= 0) return;
	if(time > newestTime) newestTime = time;
	if(time!=0 && (time < oldestTime || oldestTime==0)) {
		oldestTime = time;
	}
}

var resetMode=false;
function resetLimits(pplot) {
	for(var i=0; i<plots[pplot].params.length; i++) {
		AjaxGetParamTimeNewest(plots[pplot].params[i]);
		AjaxGetParamTimeOldest(plots[pplot].params[i]);
	}

//	document.getElementById('TimeSelect').value = 100;		// peg slider
}

// get data at limits (new, old)
// should have a time-only fetch version (f=t)
function getLimits(forceFlagOld, forceFlagNew) {
	if(nplot<=0 || !plots[0] || !plots[0].params || plots[0].params.length<=0) return;		// notta
	
//	var iplot=0;		// find first plot with channel
//	for(iplot=0; iplot<nplot; iplot++) if(plots[iplot] && plots[iplot].params.length > 0) break;
//	if(debug) console.debug('!!!!getLimits, newestTime: '+newestTime+", oldestTime: "+oldestTime+", limitParam: "+plots[iplot].params[0]+", forceOld: "+forceFlagOld+', forceNew+', forceFlagNew);

	if(newestTime == 0 || newestTime < oldestTime || forceFlagNew) {
		updateNewest();
	}
	
	if(oldestTime == 0 || oldestTime > newestTime || forceFlagOld) {
		updateOldest();
	}
	
	return(status);
}

// get newest all plot params
function updateNewest() {
//	console.debug("updateNewest!");
	newestTime = 0;		// force update
	for(var j=0; j<plots.length; j++) {
		for(var i=0; i<plots[j].params.length; i++) {
			AjaxGetParamTimeNewest(plots[j].params[i]);
		}
	}
}

//get oldest all plot params
function updateOldest() {
//	console.debug("updateOldest!");
	oldestTime = new Date().getTime();		// force update

	for(var j=0; j<plots.length; j++) {
		for(var i=0; i<plots[j].params.length; i++) {
			AjaxGetParamTimeOldest(plots[j].params[i]);
		}
	}
}

function AjaxGetParamTimeNewest(param) {	
	var xmlhttp=new XMLHttpRequest();
	var munge = "?dt=s&f=t&r=newest&d=0&refresh="+(new Date().getTime());		// no cache
	var url = serverAddr + servletRoot+"/"+escape(param)+munge;
	if(debug) console.debug(' AjaxGetParamTimeNewest, url: '+url);

	xmlhttp.onreadystatechange=function() {
		if (xmlhttp.readyState==4) {
	    	fetchActive(false);

			if(xmlhttp.status==200) {
				var ptime = 1000* Number(xmlhttp.responseText);		// msec
				if(ptime > newestTime) {
					newestTime = ptime;
					gotNewTime = newestTime;
				}
				if(debug) 
					console.debug("AjaxGetParamTimeNewest, param: "+param+", response.length: "+xmlhttp.responseText.length+', newestTime: '+newestTime);

				// fetch updated time info from header (may get redundant newTime if available)
//				updateHeaderInfo(xmlhttp, url, param);
			}
			else {  				
				console.log('AjaxGetParamTime Error: '+url);
			}
		}
	};
	xmlhttp.open("GET",url,true);				// arg3=false for synchronous request
	fetchActive(true);
	xmlhttp.send();
}

function AjaxGetParamTimeOldest(param) {	
	var xmlhttp=new XMLHttpRequest();
	var munge = "?dt=s&f=t&r=oldest&d=0";
	var url = serverAddr + servletRoot+"/"+escape(param)+munge;
	if(debug) console.debug(' AjaxGetParamTimeOldest, url: '+url);

	xmlhttp.onreadystatechange=function() {
		if (xmlhttp.readyState==4) {
	    	fetchActive(false);

			if(xmlhttp.status==200) {
				var ptime = 1000* Number(xmlhttp.responseText);		// msec
				if(ptime < oldestTime) {
					oldestTime = ptime;
				}
				if(debug) console.debug("AjaxGetParamTimeOldest, param: "+param+", response.length: "+xmlhttp.responseText.length+', oldestTime: '+oldestTime);
			}
			else {  				
				console.log('AjaxGetParamTime Error: '+url);
			}
		}
	};
	xmlhttp.open("GET",url,true);				// arg3=false for synchronous request
	fetchActive(true);
	xmlhttp.send();
}

//----------------------------------------------------------------------------------------
//buildCharts:  build canvas and smoothie charts

function buildCharts() {
	refreshInProgress = true;
	if(debug) console.log('buildCharts: '+plots.length);
	gotTime = [];					// reset newTime array

	var emsg = 'Your browser does not support HTML5 canvas';

	// clean up
	var graphs=document.getElementById("graphs");
	while(graphs.firstChild) graphs.removeChild(graphs.firstChild);	// clear old		

	var Wg = graphs.clientWidth;		// fixed value all plots

	// create each plot
	var nparam = 0;		// count active params
	var ncol = numCol;
	if(ncol == 0) {	 // auto
		if(window.innerWidth > window.innerHeight) {		// wider than tall
			switch(plots.length) {	
			case 2:		case 4:		case 6:		case 8:		case 10:	case 14:	ncol = 2;	break;
			case 9:		case 12:	case 15:	case 18:					ncol = 3;	break;
			case 16:	case 20:	ncol = 4;	break;
			default:											ncol = 1;	break;
			}
		}
		else {
			switch(plots.length) {				// taller than wide
			case 4:		case 6:		case 8:		case 10:	case 14:	ncol = 2;	break;
			case 9:		case 12:	case 15:	case 18:			ncol = 3;	break;
			case 16:	case 20:							ncol = 4;	break;
			default:									ncol = 1;	break;
			}
		}
	}
	if(ncol > plots.length) ncol = plots.length;
	var nrow = Math.ceil(plots.length / ncol);		
	var iplot = 0;
	for(var irow=0; irow<nrow; irow++) {
		var row  = graphs.insertRow(-1);		// add rows as needed

		for(var icol=0; icol<ncol && iplot<plots.length; icol++,iplot++) {
			var cell1=row.insertCell(-1);		// was 0

			// plotDiv child of graphDiv	
			var plotTable = document.createElement('table');
//			plotTable.setAttribute("border","1");
			cell1.appendChild(plotTable);

			var prow = plotTable.insertRow(0);
			var pcell0 = prow.insertCell(0); 

			// parent div to hold chanbox, chanlist, clearbox
			var pdiv = document.createElement('div');
			pdiv.id = "phead";
			pcell0.appendChild(pdiv);

			// + addchan button
			addChanBox(iplot, pdiv);					

			// child div to hold chanlist
			var cdiv = document.createElement('div');
			cdiv.style.float="left";
			cdiv.style.width="1px";		// nominal, will overflow
			pdiv.appendChild(cdiv);

			//  create label for each param
			for(var j=0; j<plots[iplot].params.length; j++) {
				nparam++;						
				// create label element above plot
				var node = document.createElement('label');
				node.style.whiteSpace="nowrap";
				var param = plots[iplot].params[j];
				if(plots[iplot].params.length > 1) param = param.split("/").pop(); 	// truncate to just param name if multiple
				node.innerHTML = param;
				node.id = 'label'+j;
				node.style.color = plots[iplot].color(j);
				node.style.padding = '0 4px';
				cdiv.appendChild(node);	
				setConfig('p'+iplot+''+j,plots[iplot].params[j]);
			}
			
			// x clearPlot button
			if(plots[iplot].params.length > 0) {		// only if any curves to clear
				addClearBox('clear'+iplot, clearPlotSelect, 'x', pdiv);
			}

			// create a canvas for each plot box
			prow = plotTable.insertRow(1);
			var pcell1 = prow.insertCell(0); 
			pcell1.style.position="relative";	// position parent of canvas so canvas-absolute is relative to this... ??
			
			var canvas = new Array();			// MJM 10/12/16
			for(i=0; i<maxLayer; i++) {
				canvas.push(document.createElement('canvas'));
				canvas[i].innerHTML = emsg; 
				canvas[i].id = 'plot'+iplot; 
				canvas[i].setAttribute("class", "canvas");

				canvas[i].width = Wg/ncol-15; 			// width used in setting chart duration

				Hg = (graphs.clientHeight / nrow) - pcell0.offsetHeight - 20;
				canvas[i].height = Hg;		// ensure same for all

				canvas[i].align="center";
				if(i>0) {
					canvas[i].style.position="absolute";
					canvas[i].style.top=0; 		// was pdiv.height (undefined)
					canvas[i].style.left=0;
				}
				canvas[i].style.zIndex = -1;				// no mouse click on layers
				canvas[i].style.zIndex = maxLayer - i;		// order alpha on top
				pcell1.appendChild(canvas[i]);
			}
			addListeners(pcell1);							// add listener to cell (vs canvas layer)
			// associate smoothie chart with canvas
			plots[iplot].addCanvas(canvas);
		}
	}


	buildChanLists();		// re-initialize (overkill?)
	updateSelect();			// update-interval selection menu
	
	top.rtflag=PAUSE;		// auto-pause (less squirmy?)
	durationSelect(document.getElementById("myDuration"));	    // plot duration selection menu		(NEED?)

	getLimits(1,1);			// re-update limits?
	
//	inProgress=0;			// failsafe 
//	setPause(false,0);		// auto pause (less perplexing) 
	refreshInProgress = false;

	setDivSize();
}	

//----------------------------------------------------------------------------------------
//drag-plot utilities

//figure out if mouse or touch events supported
//isTouchSupported = 		'ontouchstart' in window 			// works on most browsers 
//					|| 	'onmsgesturechange' in window;		// IE10

//var isTouchSupported = 'ontouchstart' in window || navigator.msMaxTouchPoints;		// MJM 3/2017
//var isTouchSupported =  ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0) || (typeof el.ongesturestart == "function");
var isTouchSupported =  ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);

isPointerEnabled = window.navigator.msPointerEnabled || window.MSPointerEvent || window.PointerEvent;
//if(isPointerEnabled) isTouchSupported = false;				// IE10 pointer/gesture events not yet supported
isPointerEnabled = false;			// messes up Android mouseMove?

var startEvent = isTouchSupported ? (isPointerEnabled ? (window.PointerEvent ? 'pointerdown' : 'MSPointerDown') : 'touchstart') : 'mousedown';
var moveEvent = isTouchSupported ?  (isPointerEnabled ? (window.PointerEvent ? 'pointermove' : 'MSPointerMove') : 'touchmove')  : 'mousemove';
var endEvent = isTouchSupported ?   (isPointerEnabled ? (window.PointerEvent ? 'pointerup'   : 'MSPointerUp')   : 'touchend')   : 'mouseup';
var outEvent = isTouchSupported ?   (isPointerEnabled ? (window.PointerEvent ? 'pointerout' : 'MSPointerOut')  : 'touchcancel'): 'mouseout';

// try fixing these:
/* startEvent = 'pointerdown'; moveEvent = 'pointermove'; endEvent = 'pointerup'; outEvent = 'pointerout'; */

function addListeners(c) {
	c.addEventListener(startEvent,mouseDown, false); 	
	c.addEventListener(endEvent,  mouseUp,   false);	
	c.addEventListener(outEvent,  mouseOut,   false);	 
	c.addEventListener("mousewheel", mouseWheel, false);
}

var rect1x=0;
var rect1y=0;
var rect2y=0;
var rect;
var startMoveTime=0;
var thiswin=0;
var thisplot=0;
var mouseIsStep=false;
var oldStepTime=0;
var mouseClickX=0;
var mouseDebug=false;

function mouseDown(e) {
	e.preventDefault();		// stop scrolling

	if(debug||mouseDebug) console.log('mouseDown'+', isTouchSupported: '+isTouchSupported+', isPointerEnabled: '+isPointerEnabled);
    e = e || window.event;

    // filter out right-mouse clicks
    if 		("which" in e) 	{
    	if(e.which == 3) return; 	// Gecko (Firefox), WebKit (Safari/Chrome) & Opera
    }
    else if ("button" in e)	{
    	if(e.button == 2) return;  // IE, Opera 
    }
	
	thisplot = mouseClickPlot(e);
	thiswin = this;		// for mouseout

	if(!plots[thisplot] || plots[thisplot].type == 'text') return;		// notta for text (yet)
	
	reScale = true;
	mouseIsMove=false;		// not yet
	setPlay(PAUSE,0);
	
	if(isTouchSupported) { 	
		if(isPointerEnabled) {
			rect1x = e.offsetX;
			rect1y = e.offsetY;
		}
		else {
			rect1x = e.touches[0].clientX; 	
			rect1y = e.touches[0].clientY; 
		}
		if(e.touches && (e.touches.length>1)) rect2y = e.touches[1].clientY; 
	} 
	else {	
		rect1x = e.clientX;				
		rect1y = e.offsetY;				
	}

	startMoveTime = getTime();
	
	if(plots[thisplot].type == 'stripchart') {
		this.addEventListener(moveEvent, mouseMove);
		return;
	}

	// mouse-step logic:
//	mouseIsStep = endsWith(plots[thisplot].params[0], ".jpg");
	mouseIsStep = (plots[thisplot].type == 'video');
	if(!mouseIsStep) return;		// step only for non-video

	var rect = e.target.getBoundingClientRect();
	mouseClickX = rect1x / (rect.right - rect.left);
	oldStepTime=0;
	if(mouseClickX >= 0.5) 	setTimeout(function(){mouseStep("next");}, 500);
	else					setTimeout(function(){mouseStep("prev");}, 500);
}

function mouseStep(dir) {
	if(!mouseIsStep) return;
	if(!refreshInProgress) {
		var stepTime = getTime();
		stepCollection(thisplot,stepTime,dir);
		if(debug||mouseDebug) console.debug('mouseIsStep: '+mouseIsStep+', stepTime: '+stepTime+' oldStepTime: '+oldStepTime+', getTime: '+getTime());
		oldStepTime = stepTime;
		setTimeSlider(getTime());
	}
	setTimeout(function(){mouseStep(dir);}, 100);
}

function mouseOut(e) {
//	if(debug||mouseDebug) console.log('mouseOut');
//	e.preventDefault();		// for IE

	if(thiswin) {
		thiswin.removeEventListener(moveEvent, mouseMove);
		thiswin=0;		// avoid thrash
	}
	mouseIsMove=mouseIsStep=false; 
//	mouseUp(e);
}

function mouseUp(e) {
//	unlock();				// unlock IOS audio?
	
	if(debug||mouseDebug) console.log('mouseUp');
//	e.preventDefault();		// for IE
	if(mouseIsStep && getTime() == startMoveTime) {
		if(mouseClickX >= 0.5) 	stepCollection(thisplot,startMoveTime,"next");
		else					stepCollection(thisplot,startMoveTime,"prev");
//		setTime(getTime());	// all setTime on display not fetch
	}
	if(thiswin) {
		thiswin.removeEventListener(moveEvent, mouseMove);
		thiswin=0;		// avoid thrash
	}
//	if(mouseIsMove) mouseMove(e);			// ?? final-position slider ??
	mouseIsMove=mouseIsStep=false;
}

function mouseClickPlot(e) {
	var elem;
	if (e.srcElement) elem = e.srcElement;
	else 			  elem = e.target;
	return parseInt(elem.id.replace('plot',''));
}

var lastMove=0;
var mouseIsMove=false;
function mouseMove(e) {
	e.preventDefault();				// stop scrolling

	if(debug||mouseDebug) console.log('mouseMove, mouseIsStep: '+mouseIsStep);
	if(mouseIsStep) return;			// no shimmy
	var now = Date().now;
	if((now - lastMove) < 100) return;	// limit update rate
	if(!refreshInProgress && !inProgress) {
		lastMove = now;
		mouseIsMove=true;

		var rect = e.target.getBoundingClientRect();
		var rectw = rect.right - rect.left;			// box width
		var eclientX;
		if(isTouchSupported) {
			if(isPointerEnabled) eclientX = e.offsetX;
			else				 eclientX = e.touches[0].clientX;
		}
		else				 eclientX = e.clientX;
		var relstep = (rect1x - eclientX)/rectw;
		
		stepDir= 0;		// no side effects
		var mDur = getDuration();		// duration msec
		var inc = relstep * mDur;			// msec		
//		if(Math.abs(relstep) < 0.01) return;				// too small to bother
		if(e.touches && e.touches.length == 2) 	pinchScale(e);
		else									mouseScale(e);
		mouseIsStep = false;		// switch gears
		var newT = Math.round(startMoveTime + inc);
//		console.log('mouseMove newT: '+newT+', startMoveTime: '+startMoveTime+', inc: '+inc);

		if(getTime() != newT || scalingMode == "Manual") {
			refreshCollection(true,newT,mDur,"absolute");		// (time is right-edge!)
//			setTime(newT);			// all setTime on display not fetch
		}
//		this.addEventListener(moveEvent, mouseMove);		// for Android?
	}
}

function mouseScale(e) {
	
	var rect = e.target.getBoundingClientRect();
	var recth = rect.bottom - rect.top;			// box height
	var eclientY;
	if(isTouchSupported) {
		if(isPointerEnabled) eclientY = e.offsetY;
		else				 eclientY = e.touches[0].clientY;
	} else				 eclientY = e.offsetY;
//	else				 eclientY = e.clientY;

	var relStart = rect1y/recth - 0.5;
	var relStepY = (eclientY - rect1y) / recth;
	if(debug||mouseDebug) console.debug('rect1y: '+rect1y+', recth: '+recth+', eclientY: '+eclientY+', mouseScale: '+relStepY+', relStepY: '+relStepY);
	
	rect1y = eclientY;								// reset baseline for setScale logic

	if(e.shiftKey) {	 // zoom
		plots[mouseClickPlot(e)].display.setScale(null, 1./(1.-relStepY));
	}
	else {				// offset
		plots[mouseClickPlot(e)].display.setScale(relStepY, null);
	}

}

function pinchScale(e) {
//	var rect = e.target.getBoundingClientRect();
//	var recth = rect.bottom - rect.top;			// box height
	var drecty = Math.abs(rect1y - rect2y);
	var erecty = Math.abs(e.touches[0].clientY-e.touches[1].clientY);
	var scale = drecty / erecty;
	
	rect1y = e.touches[0].clientY;			// reset baseline for setScale logic
	rect2y = e.touches[1].clientY;

	if(debug||mouseDebug) console.debug('pinchScale: '+scale+', erecty: '+erecty+', drecty: '+drecty);

	plots[mouseClickPlot(e)].display.setScale(null, scale);
}

function mouseWheel(e) {
	if(inProgress || refreshInProgress || scalingMode!="Manual") return;			// pacing
	var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
	if(debug||mouseDebug) console.debug('mouseWheel delta: '+delta);
	plots[mouseClickPlot(e)].display.setScale(null, 1.-(delta/4.));
	refreshCollection(true,getTime(),getDuration(),"absolute");
}

//----------------------------------------------------------------------------------------
//buildChanLists:  build channel select option list for all plots

function buildChanLists() {
//	console.debug('buildChanLists!, channels.length: '+channels.length);
	channels.sort();			// alpha sort
	for(var j=0; j<plots.length; j++) {
		var add = document.getElementById('add'+j);
//		if(add.optgroup) add.optgroup.length = 0;	// reset
		add.options.length = 0;		// reset
		var ogl=add.getElementsByTagName('optgroup');
		for (var i=ogl.length-1;i>=0;i--) add.removeChild(ogl[i]);

		var elo = document.createElement("option");
		elo.value = elo.textContent = '+';
		add.appendChild(elo);
		var mysrc=''; 	var elg='';
		var listlen = channels.length;
		for(var i=0; i<listlen; ) {	
			var elo = document.createElement("option");
			var src = channels[i].split('/');
			var chan = src.pop();
			src = src.join('/')+'/';
			if(src != mysrc) {		// new source group
				elo.value = '';
				elg = document.createElement("optgroup");
				elg.label = src;
				add.appendChild(elg);
				mysrc = src;
			}
			else {					// add channel to source group
				elo.value = channels[i];
//				elo.textContent = chan.split(".")[0];	// strip suffix from display?
				elo.textContent = chan;		
				elg.appendChild(elo);
				i++;
			}
		}
		add.width='100px';
		add.style="width: 100px";
	}
}

//----------------------------------------------------------------------------------------
//addChanBox:  add checkbox to plot

function addChanBox(idx, el) {
	var input = document.createElement('select');
	input.id = 'add'+idx;
//	input.style.width = '2.5em';		// was '80px'
	var div = document.createElement('div');
	div.style.width='2em';
	div.style.float='left';
	div.style.overflow='hidden';
	el.appendChild(div);
	div.appendChild(input);
	input.addEventListener('mousedown', pauseRebuild);
	input.addEventListener('change', addChanSelect);
}

//----------------------------------------------------------------------------------------
//pauseRebuild() 

function pauseRebuild() {
	noRebuild = true;
}

//----------------------------------------------------------------------------------------
//addClearBox:  add checkbox to plot

function addClearBox(id, cb, lab, el) {
	var input = document.createElement('button');
	input.id = id;
	input.textContent = lab;
	input.textAlign="top";

	var div = document.createElement('div');
//	div.style.width='2vmax';
	div.style.float='right';
	div.style.textAlign="right";
	el.appendChild(div);
	div.appendChild(input);
	input.addEventListener('click', clearPlotSelect);	
}

//----------------------------------------------------------------------------------------
//addChanSelect:  add parameter to selected plot

function addChanSelect() {
	if(!this.options) return;		// some browsers
//	var nline = totalLines();
	noRebuild=true;					// no rebuild charts during selection

	var chan = this.options[this.selectedIndex].value;
	if(chan == '+') return;	// firewall: not a real selection

	if(chan=='' || endsWith(chan,'/')) {
		this.selectedIndex = 0;
		return;			// not a channel
	}

	var pplot = parseInt(this.id.replace('add',''));
//	plots[pplot].addLine(chan);
	plots[pplot].addParam(chan);
	noRebuild = false;
	
	if(pplot==0 && 				// only reset limits on first param of first plot
			plots[pplot].params.length == 1) {
		resetLimits(pplot);
		rebuildPageWait(20);
		goBOF();
	}
	else rebuildPageWait(20);
}

//----------------------------------------------------------------------------------------
//totalLines:  total active params being plotted

function totalLines() {
	var nline=0;
	for(var i=0; i<plots.length; i++) nline += plots[i].params.length;
	return nline;
}

//----------------------------------------------------------------------------------------
//clearPlotSelect:  clear selected plot

function clearPlotSelect(cb) {
	var pplot = parseInt(this.id.replace('clear',''));
	plots[pplot].clear();													// clear timeseries from plot
	for(var j=0;j<maxParam;j++) {
//		console.debug('clearplot: '+j);
		setConfig('p'+pplot+''+j,null);					// remove from config
	}
	plots.splice(pplot,1,new plotbox({doFill:doFill,doSmooth:doSmooth}));	// empty new plot

	noRebuild = false;
	rebuildPage();
}

//----------------------------------------------------------------------------------------	
//goFuncs:  playback data controls

function goBOF() {
	goPause();
//	getLimits(1,0);		// ??
	reScale = true;
	stepDir= -1;
	if(debug) console.log("goBOF");
	refreshCollection(true,0,getDuration(),"oldest");	// time is right-edge!
//	goTime(0);			// absolute BOF per oldestTime (same all chans)
}

function goPause() {
	reScale = true;
	stepDir= 0;
//	newTime = [];					// reset newTime array
	setPlay(PAUSE,0);			// was ,-1
	updatePauseDisplay(top.rtflag);
}

function playFwd() {
	goPause();
	reScale = true;
	getLimits(0,0);		// make sure limits are known...
//	getLimits(1,1);		// make sure limits are known...
	stepDir= 2;			// this affects playTime() to use RT-playDelay to advance playback clock
	setPlay(PLAY,getTime());	
}

function togglePlay(el){
//	replayPcmChunk();
//	unlock();		// unlock iOS audio?
	
	if(el.innerHTML=="||") { 
		el.innerHTML=playStr;  
		goPause(); 
	}
	else { 
		if(isIOS) replayPcmChunk();		// unlock IOS audio

		if(document.getElementById('play').innerHTML == 'RT') 
				goRT();
		else 	playFwd(); 
		
		el.innerHTML='||'; 	
	}
	return false;
}

function goEOF() {
	goPause();
//	getLimits(0,1);		// ??
	reScale = true;
	stepDir= 1;
	if(debug) console.log("goEOF");
	refreshCollection(true,0,getDuration(),"newest");
//	goTime(100);			
//	refreshCollection(true,newestTime,getDuration(),"absolute");	// absolute EOF per newestTime (same all chans)
	setRT = true;		// set button state to RT
	document.getElementById('play').innerHTML = 'RT';
}

function goRT() {
	reScale = true;
	stepDir=2;
	if(debug) console.log("goRT!");
	refreshCollection(false,0,getDuration(), "newest");
}

function goRT2() {
	refreshCollection(false,0,getDuration(), "newest");
}

var maxwaitTime=0;
function goTime(percentTime) {
	goPause();		// make sure stopped
	stepDir=0;		// turn off playRvs

//	if(percentTime==0) refreshCollection(true,getDuration(),getDuration(),"oldest");		// right-edge time
//	else if (percentTime == 100) refreshCollection(true,0,getDuration(),"newest");
//	else {
		
		getLimits(0,0);				// make sure limits are known...
		++maxwaitTime;
		if(newestTime==0 && maxwaitTime<50) {		// hopefully doesn't happen, obscure problems if lumber on
			if(debug) console.debug("waiting for limits to be set...");
			setTimeout(function() { goTime2(percentTime); }, 100);		// short delay (avoid possible infinite loop)
		}
		else goTime2(percentTime);
//	}
}

// go to percentTime, where time is left-edge (oldest) of duration time interval
function goTime2(percentTime) {
	maxwaitTime=0;
	if(newestTime == 0) {		// hopefully doesn't happen, obscure problems if lumber on
//		alert('Warning, unknown limits, unable to set time position');			
		return;
	}
	
	var mDur = 0.;
//	if(!isImage) 					// isImage unreliable async global?
		mDur = getDuration();		// duration msec
	if(mDur > (newestTime - oldestTime)) mDur = newestTime - oldestTime;
	
	var gtime = oldestTime + mDur + percentTime * (newestTime - oldestTime - mDur) / 100.;		
	// MJM 2/8/17:  gotime left-edge plot for consistency with setTime:
//	var gtime = oldestTime + percentTime * (newestTime-mDur - oldestTime) / 100.;
	
// gotime is right-edge plot
	if(gtime < oldestTime+mDur) gtime = oldestTime+mDur;
	if(gtime > newestTime) gtime = newestTime;
	
	if(debug) console.debug("goTime: "+gtime+", percent: "+percentTime+", oldestTime: "+oldestTime+", newestTime: "+newestTime+", mDur: "+mDur);
	refreshCollection(true,gtime,mDur,"absolute");	// go to derived absolute time
	
	// all setTime on display not fetch
//	if(percentTime==0 || percentTime==100) 	setTime(gtime);	
//	else									setTimeNoSlider(gtime);		// no tug of war
}

//----------------------------------------------------------------------------------------	
/**
 * StripChart Utilities
 * Matt Miller, Cycronix
 * 11/2013
 */
//----------------------------------------------------------------------------------------	

//----------------------------------------------------------------------------------------	
// PLOT Object Definition
// Wrapper around SmoothieChart (smoothie.js)
// was stripchart.js
//----------------------------------------------------------------------------------------

function plot() {
	this.params = new Array();
	this.lines = {};
	this.horizGrids = 10;					// grid lines per plot width
	this.vertGrids = 4;						// grid lines per plot height
	this.width = 800;						// adjustable plot width (pixels)
	this.fillStyle = 'rgba(0,0,0,0.1)';		// under-line fill alpha
	this.doFill=false;						// under-line fill?
	this.doSmooth=false;					// bezier curve interpolate?
//	this.maxChartPts = 10000;		// keep points beyond visible limits up to this amount
									// ref:  86400 is one day at 1Hz
	duration=0;								// book keeping
	this.oldest=0;							// reference
	this.yoffset = 0;						// default autoscale
	this.yrange = 1;
	this.autoScale=true;					
	this.ymin = 0.;
	this.ymax = 0.;
	
	// over-ride defaults if provided 
	for (var n in arguments[0]) { this[n] = arguments[0][n]; }
//	console.log('plot doFill: '+this.doFill+', doSmooth: '+this.doSmooth);
	
	var interpolate;		// note: smooth is per chart (fill is per-line)
	if(doSmooth) interpolate = 'bezier';
	else		 interpolate = 'linear';
	
	// create smoothie chart
	if(debug) console.log('new chart');
	
	this.chart = new SmoothieChart({
		yRangeFunction:myYRangeFunction.bind(this),
		interpolation:interpolate,			// linear, bezier
		grid:{ 
			fillStyle:'#ffffff', 
			strokeStyle:'#cccccc', 
			sharpLines:false, 
			verticalSections:this.vertGrids 
		},
		labels:{ 
			fillStyle:'#000000', 
			fontSize:'12', 
			precision:1 
		},
//		timestampFormatter:SmoothieChart.timeFormatter,
		timestampFormatter:myTimeFormatter,
		timerangeFormatter:myRangeFormatter,
		numPointsFormatter:myPtsFormatter
	});

	this.chart.options.scaleSmoothing = 0.25;		// default 0.125
	this.chart.stop();		// ?? init
	
	//----------------------------------------------------
	// set short numPts value with letter suffix
	function myPtsFormatter(val) {
		if(val <= 0) return "";
		return numberWithCommas(val) + ' pts';
	}
	
	function numberWithCommas(x) {
	    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
	
	//----------------------------------------------------
	// set short range value with letter suffix
	function myRangeFormatter(val) {
	    var aval = Math.abs(val);
	      
		var prec=5;		// digits of precision
		if(aval == 0 || isNaN(aval)) prec=0;
		else if(aval > 20) 	prec=0;
		else if(aval > 1)  	prec=1;
		else 				prec = Math.ceil(-Math.log(aval)/Math.LN10);
		if(scalingMode != "Auto") prec = prec+3;		// need more digits if tight scaling
		else					  prec = prec+1;		// at least get a bit more
		
		if(prec < 0 || prec > 5) Precision=5;
	      
	    valStr = parseFloat(val).toFixed(prec);
	    if(aval >= 1000000000)	 valStr = parseFloat(val/1000000000).toFixed(prec) + "G";
	    else if(aval >= 1000000) valStr = parseFloat(val/1000000).toFixed(prec) + "M";
	    else if(aval >= 1000) 	 valStr = parseFloat(val/1000).toFixed(prec) + "K";					
	    return valStr;
	}
	
	//----------------------------------------------------
	// Sample timestamp formatting function
	function myTimeFormatter(date) {
		function pad2(n) { return (n < 10 ? '0' : '') + n; }
		var y= pad2(date.getFullYear() - 2000);
		var M= pad2(date.getMonth()+1);
		var d= pad2(date.getDate());
		var h= pad2(date.getHours());
		var m= pad2(date.getMinutes());
		var s= pad2(date.getSeconds());
		var ms= pad2(date.getMilliseconds());
		var now = new Date().getTime();		// msec since 1970
		var then = date.getTime();
		var longAgo = (now - then) > 86400000;	// 1 day (msec)
		if(longAgo && duration > 864000)	return M+'/'+d+'/'+y;		// 10 days (duration=sec)
		else if(longAgo && duration >= 86400) 	return M+'/'+d+' '+h+':'+m;
		else if(duration >= 600)		return h+':'+m;		// trust sec==00 if min>=10
		else if(duration >= 10)			return h+':'+m+':'+s;
		else if(duration >= 1) {
			var fsec = parseFloat(s+'.'+ms).toFixed(1).toString();		// 1 decimal digit
			return h+':'+m+':'+fsec;
		}
		else {
			var fsec = parseFloat(s+'.'+ms).toString();	// trim trailing zeros
			return ':'+fsec;
		}
	};
	
	// add a time series line to plot
	this.addLine = function(param) {
		if(this.lines[param]) {
//			alert("Duplicate Chan: "+param);
			return;
		}
		var fill=undefined;		// add lines per current fill state
		if(this.doFill) fill = this.fillStyle;
		this.params.push(param);
		var line = new TimeSeries();
		this.lines[param] = line;
		var coloridx = Object.keys(this.lines).length-1;
		if(debug) console.log('addTimeSeries');
		this.chart.addTimeSeries(line, { 
			lineWidth:1.4,
			strokeStyle:this.color(coloridx),
			fillStyle:fill 
		});
	};
	
	// append a data value to timeseries
	this.addValue = function(param, time, value) {
		if((value!=undefined) && !isNaN(value)) { 	// possible with slow initial fetch
			var line = this.lines[param];
			var nosort=false;	// nosort causes smoothie plot glitches!
			if(line.data.length > 20000) nosort = true;		// large plots can't afford sorting (exponential work!)
//			console.debug('addValue, param: '+param+', line.length: '+line.data.length+', nosort: '+nosort);

			// don't round to ints, can plot data at > 1Ksa/sec (MJM 3/16/2017)
			//			time = Math.round(time);		// nearest msec (smoothie only handles msec)
			
			if(nosort) {		// try faster append without sort
				line.data.push([time, value]);		// try faster push 
				line.maxValue = isNaN(line.maxValue) ? value : Math.max(line.maxValue, value);
				line.minValue = isNaN(line.minValue) ? value : Math.min(line.minValue, value);
			} else {
				line.append(time, value);	// smoothie func
			}
			this.chart.now = time;		// for playback time render()
		}
	};
	
	// direct-assignment a data value to timeseries
	this.putValue = function(line, time, value, idx) {
//		console.debug('putValue, param: '+param+', line.length: '+line.data.length);

		line.data[idx] = [time, value];		// try faster push 
		line.maxValue = isNaN(line.maxValue) ? value : Math.max(line.maxValue, value);
		line.minValue = isNaN(line.minValue) ? value : Math.min(line.minValue, value);

		this.chart.now = time;		// for playback time render()
	};
	
	this.getData = function(param) {
		return line = this.lines[param].data;		// array of time,value tuples
	}
	
	// tweak precision min/max label (ToDo: handle multiple lines/chart)
	this.setPrecision = function(param) {
		return;		// defunct with timerangeFormatter
		var line = this.lines[param];
		var Precision=5;
		var minV=Math.abs(line.minValue);
		var maxV=Math.abs(line.maxValue);
		var limitV = (minV > maxV) ? maxV : minV;
		if(limitV == 0 || isNaN(limitV)) Precision=0;
		else if(limitV > 10) Precision=0;
		else if(limitV > 1)  Precision=1;
		else 				 Precision = Math.ceil(-Math.log(limitV)/Math.LN10);
		if(Precision < 0 || Precision > 5) Precision=5;
		this.chart.options.labels.precision=Precision;	
	};
	
	// associate a canvas with this chart
	this.addCanvas = function(element) {
		this.width = element[0].width;		// stripcharts use only first layer
		this.canvas = element[0];
		this.chart.streamTo(element[0],1000);  // 1 sec delay
	};
	
	this.setDelay = function(delay) {
		this.chart.delay = delay;
	};
	
	this.stop = function() {			// no go
		this.chart.stop();
	};
	
	this.start = function() {			// re go
//		this.dropdata();				// eliminate old-data glitch?
		this.chart.start();
	};
	
	this.render = function(etime) {
		if(typeof this.canvas == 'undefined') return;		// notta to do
		this.chart.stop();									// no scrolling if render!?
		var chartnow = (etime>0)?etime:this.chart.now;
		this.chart.options.scaleSmoothing = 1.0;	// one-step jump to new scale
		for(var key in this.lines) {
			if(this.lines[key].data.length > 0) this.lines[key].resetBounds();		// only scale active lines
		}
//		console.debug('this.render, chartnow: '+chartnow);
//		console.trace();
		this.chart.render(this.canvas, chartnow);
		this.chart.options.scaleSmoothing = 0.25;   		// was 0.125
	};
	
	this.dropdata = function() {
		this.chart.stop();
		for(var j=0; j<this.chart.seriesSet.length; j++) {
			var ts = this.chart.seriesSet[j].timeSeries;
//			ts.data.splice(0, ts.data.length);		// delete all data
			ts.data = [];				// better delete?
		};
	};
	
	this.clear = function() {			// stop interval timers
		this.chart.stop();
		for(var j=0; j<this.chart.seriesSet.length; j++) 
			this.chart.removeTimeSeries(this.chart.seriesSet[j]);
	};
	
	this.nuke = function() {			// nuke charts and lines?
		this.clear();
		for(var i=0; i<this.lines.length; i++) delete this.lines[i];
		delete this.chart;
	};
	
	// adjust plot width to meet duration
	this.setDuration = function(secondsPerPlot) {
		duration = secondsPerPlot;
		var millisPerPixel = 1000 * secondsPerPlot / this.width;
		var millisPerLine = millisPerPixel * this.width / this.horizGrids;
		this.chart.options['millisPerPixel'] = millisPerPixel;
		this.chart.options.grid['millisPerLine'] = millisPerLine;
	};
	
	// set plot interpolate option
	this.setSmooth = function(dosmooth) {
		this.doSmooth = dosmooth;
		if(dosmooth) this.chart.options.interpolation = 'bezier';
		else		 this.chart.options.interpolation = 'linear';
	};
	
	// set plot fill options all lines this plot
	this.setFill = function(dofill) {
		this.doFill = dofill;
		var fill = undefined;
		if(dofill) fill = this.fillStyle;
		for(var j=0; j<this.chart.seriesSet.length; j++) {
			this.chart.seriesSet[j].options.fillStyle=fill;
		}
	};
	
	// set scale in terms of normalized offset and range
	this.setScale = function(yoffset, yrange) {
		if(scalingMode != "Manual") return;			// notta
		
		if(this.autoScale) {						// initialize, then switch to manual scaling
			this.yrange = (this.ymax - this.ymin);
			this.yoffset = this.ymin + this.yrange / 2;
			this.autoScale = false;
		}
		if(yoffset != null) this.yoffset += yoffset * this.yrange;
		if(yrange != null)  this.yrange   = yrange  * this.yrange;
	}
	
	// myYRangeFunction:  custom y-range function
	function myYRangeFunction(range) {
		
		if(scalingMode != "Manual") this.autoScale = true;

		if(!this.autoScale) {									// Manual Scaling
			this.ymax = this.yoffset + this.yrange/2;
			this.ymin = this.yoffset - this.yrange/2;
			return { min: this.ymin, max: this.ymax};
		}

		else if(scalingMode == "Tight") {						// Tight scaling

			var wildPointReject = 5;							// wild point reject > this number stdDev	
			if(wildPointReject > 0) {						
				var getAverage = function( data ){
					var i = data.length, 
						sum = 0;
					while( i-- ) sum += data[ i ][1];							// bleh, values are in data[*][1]
					return (sum / data.length );
				},
				getStandardDeviation = function( data ){
					var avg = getAverage( data ), 
						i = data.length,
						v = 0;
					while( i-- )v += Math.pow( (data[ i ][1] - avg), 2 );		// bleh, values are in data[*][1]
					v /= data.length;
					return Math.sqrt(v);
				};	    		    

				// now compute min/max throwing out wildpoints
				var chartMaxValue = Number.NaN, chartMinValue = Number.NaN;
				for (var d = 0; d < this.chart.seriesSet.length; d++) {
					var timeSeries = this.chart.seriesSet[d].timeSeries;
					var mean = getAverage(timeSeries.data);
					var stdDev = getStandardDeviation(timeSeries.data);
					var wpmax = mean + wildPointReject * stdDev;
					var wpmin = mean - wildPointReject * stdDev;
					
					if (timeSeries.data.length) {
						// Walk through all data points, finding the min/max value
						timeSeries.maxValue = timeSeries.data[0][1];
						timeSeries.minValue = timeSeries.data[0][1];
						for (var i = 1; i < timeSeries.data.length; i++) {
							var value = timeSeries.data[i][1];
							if (value > timeSeries.maxValue && value < wpmax) timeSeries.maxValue = value;
							if (value < timeSeries.minValue && value > wpmin) timeSeries.minValue = value;
						}
						chartMaxValue = !isNaN(chartMaxValue) ? Math.max(chartMaxValue, timeSeries.maxValue) : timeSeries.maxValue;
						chartMinValue = !isNaN(chartMinValue) ? Math.min(chartMinValue, timeSeries.minValue) : timeSeries.minValue;
					} 

					if(Math.abs(range.min - timeSeries.minValue) < stdDev) timeSeries.minValue = range.min;		// only adjust if > stdDev
					if(Math.abs(range.max - timeSeries.maxValue) < stdDev) timeSeries.maxValue = range.max;	
					
					chartMaxValue = !isNaN(chartMaxValue) ? Math.max(chartMaxValue, timeSeries.maxValue) : timeSeries.maxValue;
					chartMinValue = !isNaN(chartMinValue) ? Math.min(chartMinValue, timeSeries.minValue) : timeSeries.minValue;
//					console.debug("series: "+d+", mean: "+mean+", stdDev: "+stdDev+", newMin: "+range.min+", newMax: "+range.max);
				}
				range.min = chartMinValue;		
				range.max = chartMaxValue;
			}
			this.ymin = range.min;
			this.ymax = range.max;
			return({min: range.min, max: range.max});
		}

		else {													// Auto and Standard scaling

			var vmin = roundHumane(range.min,0);
			var vmax = roundHumane(range.max,1);
			if((vmin*vmax>0) && (vmin/vmax <= 0.25)) vmin = 0.;
			if(isNaN(vmin) || isNaN(vmax)) return({min: range.min, max: range.max});		// watch for bad nums

			if((scalingMode == "Auto") && (reScale==false)) {	// Auto scaling
				if(vmax > this.ymax) this.ymax = vmax;			// increasing only
				if(vmin < this.ymin) this.ymin = vmin;				
//				if(debug) console.debug("autoscale, vmax: "+vmax+", ymax: "+this.ymax+", vmin: "+vmin+", ymin: "+this.ymin);
			}
			else {												// Standard scaling
				this.ymax = vmax;
				this.ymin = vmin;			
				if(plots.length==1 && scalingMode=="Auto") reScale = false;	// one-shot rescale flag (logic doesn't work per-plot)
				if(debug) console.debug("stdscale, vmax: "+vmax+", ymax: "+this.ymax+", vmin: "+vmin+", ymin: "+this.ymin);
			}

			// keep it zero-centered if close
			var aymax = Math.abs(this.ymax);
			var aymin = Math.abs(this.ymin);
			if((this.ymin*this.ymax)<0 && (aymax / aymin) < 3 && (aymax / aymin) > 0.3) {
				if(aymax>aymin) this.ymin = Math.sign(this.ymin)*aymax;
				else			this.ymax = Math.sign(this.ymax)*aymin;
			}
			
			this.yrange = this.ymax - this.ymin;
			this.yoffset = this.ymin + this.yrange / 2;

			return {min: this.ymin, max: this.ymax};
//			return {min: vmin, max: vmax};
		}
	} 
	
	// roundHumane: nicely round numbers up for human beings (adapted from smoothieChart)
	// Eg: 180.2 -> 200, 3.5 -> 5, 8.9 -> 10
	function roundHumane(value, up) {
		if(value == 0) return 0;						// notta to do
		var ln10 = Math.log(10);
		var sign=(value>0)?1:-1;
		value = Math.abs(value);
		var mag = Math.floor(Math.log(value) / ln10);	// magnitude of the value
		var magPow = Math.pow(10, mag);
		var magMsd = Math.ceil(value / magPow);			// most significant digit
	
		// promote/demote MSD to 1, 2, 5
		var gobig = (up && sign>0 || !up && sign<0)?1:0;					
		if (magMsd > 5.0) 		{ if(gobig) 	magMsd = 10.0;	else 	magMsd = 5.0; }
		else if (magMsd > 2.0)	{ if(gobig) 	magMsd = 5.0;	else	magMsd = 2.0; }
		else if (magMsd > 1.0) 	{ if(gobig)		magMsd = 2.0;	else	magMsd = 1.0; }
		return sign * magMsd * magPow;
	}
}

//----------------------------------------------------------------------------------------
// plot.prototype.color:  get color from array, limit length

plot.prototype.color = function(idx) {
	var colors = new Array('#2020ee','#ee1010','#00dd00','#880088','#000000','#808080');	// ~RGB
	if(idx < colors.length) return colors[idx];
	else					return colors[colors.length-1];
};

//----------------------------------------------------------------------------------------	
/**
 * PlotBox Wrapper Object
 * Matt Miller, Cycronix
 * 03/2014
 */
//----------------------------------------------------------------------------------------	

//----------------------------------------------------------------------------------------	
// PLOTBOX Object Definition
// Wrapper around stripcharts, video, gages, etc 
//----------------------------------------------------------------------------------------

function plotbox() {
	this.params = new Array();
	this.type = null;
	this.display = null;
	this.canvas = null;
	this.doFill=false;						// under-line fill?
	this.doSmooth=false;					// bezier curve interpolate?
	this.nfetch=0;
	
	// add a parameter to this plot
	this.addParam = function(param) {
		
		if		(endsWith(param, ".jpg")) 							paramtype = 'video';
//		else if	(endsWith(param,".mp3") || endsWith(param,".wav")) 	paramtype = 'audio';
		else if (endsWith(param,"txt"))								paramtype = 'text';
		else														paramtype = 'stripchart';
		if(this.type == null && paramtype != 'text') this.type = paramtype; 			// only set type on first param

//		if(debug)console.log('addParam: '+param+", type: "+this.type);

		switch(this.type) {
			case 'stripchart': 
				if(paramtype == 'video') {
					alert("cannot add video to stripchart");
					return;
				}
				if(this.display == null) this.display = new plot({doFill:doFill,doSmooth:doSmooth});	
				this.display.addLine(param);
				break;
			case 'video':
				this.display = new vidscan(param);	
				break;	
			case 'audio':		
				if(this.display == null) this.display = new audioscan();	// was audioscan(param)
				else if(paramtype == 'audio') {		// presume a stripchart added to video is audio
					alert("only one audio per plot");	
					return;
				}
				break;	
			case 'text':
				break;
		}
		this.params.push(param);
	}
	
	this.clear = function() {
		switch(this.type) {
			case 'stripchart':	this.display.clear();	break;
		}
	}
	
	this.addValue = function(param, time, value) {
		switch(this.type) {
			case 'stripchart':	this.display.addValue(param, time, value);	break;
		}
	}
	
	this.render = function(etime) {
		switch(this.type) {
			case 'stripchart':	this.display.render(etime);		break;
		}
	}
	
	this.start = function() {
//		console.log("plotbox.start, display: "+this.display);
		switch(this.type) {
			case 'stripchart':	this.display.start();		break;
//			case 'video':		this.display.vidPlay();		break;
		}
	}
		
	this.stop = function() {
		switch(this.type) {
			case 'stripchart':	this.display.stop();		break;
//			case 'video':		this.display.vidStop();		break;
		}
	}
	
	this.setDelay = function(delay) {
		switch(this.type) {
			case 'stripchart':	this.display.setDelay(delay);	break;
		}
	}
	
	this.dropdata = function() {
		switch(this.type) {
			case 'stripchart':	this.display.dropdata();	break;
		}		
	}
	
	this.setDuration = function(secondsPerPlot) {
		switch(this.type) {
			case 'stripchart':	this.display.setDuration(secondsPerPlot);	break;
		}	
	}
	
	this.setSmooth = function(dosmooth) {
		switch(this.type) {
			case 'stripchart':	this.display.setSmooth(dosmooth);	break;
		}
	};
	
	this.setFill = function(dofill) {
		switch(this.type) {
			case 'stripchart':	this.display.setFill(dofill);	break;
		}
	}
	
	this.addCanvas = function(element) {
		this.canvas = element;
		if(this.display != null) {
			this.display.addCanvas(element);
		}
	}
	
	this.color = function(idx) {	
		var colors = new Array('#0000ff','#ff0000','#00dd00','#880088','#000000','#808080');	// ~RGB
		if(idx < colors.length) return colors[idx];
		else					return colors[colors.length-1];
	}
	
//  ----------------------------------------------------------------------------------------    
	// setText: display text in plot box
	this.setText = function(text) {
		var lineHeight = 20;
		var lineMargin = 20;

		var cvs = this.canvas[maxLayer-1];		// last layer
		var ctx = cvs.getContext('2d');
		ctx.font = "16px Arial";

		ctx.beginPath();				// white "paper" box
		ctx.rect(0, 0, cvs.width, cvs.height);
		ctx.fillStyle = 'white';
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = 'black';
		ctx.stroke();

		ctx.fillStyle = 'black';
		var y = lineHeight+5;
		var lines = text.split('\n');
		var firstLine = lines.length - Math.ceil((cvs.height-20) / lineHeight);	// drop old lines
		if(firstLine < 0) firstLine = 0;
		for(var n=firstLine; n < lines.length; n++) {
			ctx.fillText(lines[n], lineMargin, y);
			y += lineHeight;
		}
	}
}

//----------------------------------------------------------------------------------------	
// AudioScan:  audio replay functions
//----------------------------------------------------------------------------------------	

//var audioContext=null;
var audioTime = 0;		// audio timing
var audioContext = new (window.AudioContext || window.webkitAudioContext)();
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

var lastAudio;
var lastRate;

playPcmChunk = function(audio, srate) {
	lastAudio = audio;
	lastRate = srate;
	
	this.rate = 22050;			// hard code audio rate for now.  22050 is slowest Web Audio supports
//	 console.debug('playPcmChunk, length: '+audio.length);

	if(audioContext == null) {
		alert('no audio context available with this browser');
		goPause();
		return;
	}
	
	var audioSource = audioContext.createBufferSource();
	audioSource.connect(audioContext.destination);
	
	if(srate <= 0) srate = this.rate;

	if(audio.length <= 0) {
		if(debug) console.warn("playPcmChunk zero length audio!");
		return;
	}
	
    try {
        var audioBuffer = audioContext.createBuffer(1, audio.length, srate);
        
        audioBuffer.getChannelData(0).set(audio);
        audioSource.buffer = audioBuffer;
        var audioDuration = audioBuffer.duration;
        var audioDeltaTime = audioTime - audioContext.currentTime;
        if(audioDeltaTime > (getDuration()/1000.) || audioDeltaTime < 0) {
//           	console.debug('RESET audio time from : '+audioTime+' to: '+audioContext.currentTime);
        	audioTime = audioContext.currentTime;	// reset audio timing
        }
        audioSource.start ? audioSource.start(audioTime) : audioSource.noteOn(audioTime);			// play with audio timing
        audioTime += audioDuration;																	// audio timing
    } catch(err) { 
        console.warn("Cannot play audio! err: "+err);          
    }
}

// following nonsense for iOS to unlock audio to user interaction
 replayPcmChunk = function() {
	if(lastAudio==null) return;
	lastAudio.length = 1;
	playPcmChunk(lastAudio, lastRate);
}

//----------------------------------------------------------------------------------------
//function to unlock IOS audio (ref: https://paulbakaus.com/tutorials/html5/web-audio-on-ios/)

var isUnlocked = false;
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

function unlock() {
	console.debug('unlock, isIOS: '+isIOS+', unlocked: '+this.isUnlocked);

	if(isIOS || this.unlocked) {
		return;
	}
	
	// create empty buffer and play it
	var buffer = audioContext.createBuffer(1, 1, 22050);
	var source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.connect(audioContext.destination);
	source.start ? source.start(0) : source.noteOn(0);	
//	source.noteOn(0);

	// by checking the play state after some time, we know if we're really unlocked
	setTimeout(function() {
		if((source.playbackState === source.PLAYING_STATE || source.playbackState === source.FINISHED_STATE)) {
			isUnlocked = true;
			console.debug('unlocked!');
		}
	}, 0);
}

//----------------------------------------------------------------------------------------	
/**
 * VidScan
 * Matt Miller, Cycronix
 * 11/2013
 * 
 * V0.1: Initial prototype release
 * V0.9: Sync with webscan plotTime
 * V2.0: adapt to webscan embedded video plots
 */
//----------------------------------------------------------------------------------------	

//----------------------------------------------------------------------------------------
// vidscan:  main function

//var videoInProgress=0;		// try global?  // should be per plot
function vidscan(param) {
//	console.log('new vidscan: '+param);
	this.videoInProgress = 0;
	this.addLayer={};
// globals
//	Tnew=0;
//	Told=0;
	this.canvas=null;
	
//  ----------------------------------------------------------------------------------------    
//  addCanvas:  set canvas object

    this.addCanvas = function(element) {
    	this.canvas = element;		// element here is array of canvas (layers)
    }

//  ----------------------------------------------------------------------------------------    
//  imgerror:  handle image load error

    function imgerror() {
    	this.videoInProgress=0;
    	console.debug('vidscan imgerror, playmode: '+getPlayMode());
    	goPause();					//  stop!
    }

//  ----------------------------------------------------------------------------------------    
    var lastload=0;
    this.setImage = function(imgurl,param,ilayer) {
    	if(!this.canvas) return;
    	
    	if(debug) console.log("vidscan setImage, inprogress: "+this.videoInProgress+', imgurl: '+imgurl+', ilayer: '+ilayer);
		var now = new Date().getTime();

		if((now-lastload)>10000) {		// checks to avoid deadlock
			if(debug) console.debug('reset video_inprogress');
    		this.videoInProgress = 0;
    	}
		// if return on videoInProgress>0, lose ability to alpha-stack images...
		else if(this.videoInProgress>1) {		// don't overwhelm (was >2)
    		if(debug) console.warn('video busy, skipping: '+imgurl+", videoInProgress: "+this.videoInProgress);
//    		this.videoInProgress = 0;		// single wait?
    		return;						
    	}
		
		lastload = now;
		this.videoInProgress++;
    	img=new Image();							// make new Image every time to avoid onload bug?
    	
    	if(ilayer >= maxLayer) ilayer = maxLayer-1;		// image layers, extra layers auto-alpha
    	img.canvas = this.canvas[ilayer];
    	if(ilayer == 0) img.alpha = 1;
    	else			img.alpha = 0.5;

    	img.onload = function() {		// draw on image load (new function with new image)
//    		if(debug) console.warn("imgload: complete: "+this.complete+", inprogress: "+this.videoInProgress+", this.width: "+this.width);
    		if(this.canvas == null) return;					// can happen with getLimits() before buildCharts()
    		ratiox = this.width / this.canvas.width;
    		ratioy = this.height / this.canvas.height;
    		if(ratiox > ratioy) {
    			w = this.canvas.width;
    			h = this.height / ratiox;
    			x = 0;
    			y = (this.canvas.height - h) / 2;
    		}
    		else {
    			h = this.canvas.height;
    			w = this.width / ratioy;
    			x = (this.canvas.width - w) / 2;
    			y = 0;
    		}

    		var ctx = this.canvas.getContext('2d');
			ctx.clearRect(0,0,this.canvas.width,this.canvas.height); 		// clear old image layer
    		ctx.globalAlpha = this.alpha;
//    		console.debug('draw alpha: '+alpha+', ilayer: '+ilayer);
    		ctx.drawImage(this,x,y,w,h);
    	}
    	img.onerror = imgerror.bind(this);
    	
		var twostep=false;
		if(twostep) {
			img.src = imgurl;								// this is what initiates network fetch
			setImageTime(imgurl,param);							// fetch timestamp separate step
		}
		else {
			this.AjaxGetImage(imgurl,img,param);				// get image and timestamp one-step (from header)
		}
    }

    /*
//  ----------------------------------------------------------------------------------------    

    this.getTold = function() { return Told; }
    this.getTnew = function() { return Tnew; }

//  ----------------------------------------------------------------------------------------    
//  getTlimit:  get time limit (Tnew - Tstart)  msec
    
    function getTlimit() {
    	getTlimit(mysrc, mysrc+"?r=newest&f=t&dt=s");
    }
    
    function getTlimit(mysrc) {
    	Told = Tnew = 0;				// reset until update
    	getTnew(mysrc);
    	getTold(mysrc);
    }

    function getTnew(mysrc) {
    	AjaxGetV(setNew, mysrc+"?r=newest&f=t&dt=s");
    	function setNew(txt) {
    		Tnew = Math.floor(1000*parseFloat(txt));
//    		console.log("Tnew: "+Tnew);
    	}
    }
    
    function getTold(mysrc) {
    	AjaxGetV(setOld, mysrc+"?r=oldest&f=t&dt=s");
    	function setOld(txt) {
    		Told = Math.floor(1000*parseFloat(txt));
//    		console.log("Told: "+Told);
    	}
    }
   */
    
//----------------------------------------------------------------------------------------
// setImageTime:  get image time via separate Ajax request
    
    function setImageTime(imgurl,param) {
    	if(debug) console.debug("image.setTime: "+imgurl);
    	AjaxGetV(imageSetTime, imgurl+"&dt=s&f=t", param);
    	function imageSetTime(txt) {
    		stime = Math.floor(1000*parseFloat(txt));		// msec
    		if(imgurl.indexOf("r=newest") != -1) { 
    			Tnew = stime;  
//        		if(Tnew > newestTime || newestTime == 0) 
    			if(Tnew > newestTime)
        			newestTime = Tnew;
    		}
    		else if(imgurl.indexOf("r=oldest") != -1) { 
    			Told = stime; 
        		if(Told!=0 && (Told < oldestTime || oldestTime == 0)) {
        			oldestTime = Told;
        		}
    		}

    		gotTime[param] = stime;
    		lastmediaTime = stime;
    	}
    }

//----------------------------------------------------------------------------------------
// AjaxGetV:  Ajax request helper func

    function AjaxGetV(myfunc, url, param, args) {	
    	var xmlhttp=new XMLHttpRequest();

    	xmlhttp.onreadystatechange=function() {
        	fetchActive(false);

    		if (xmlhttp.readyState==4) {
    			if(xmlhttp.status==200) {
    				myfunc(xmlhttp.responseText, url, args);
    			}
    			else {
//    				if	   (url.indexOf("r=next") != -1) newTime[param] = 99999999999999;
//    	    		else if(url.indexOf("r=prev") != -1) newTime[param] = 0;   				
    			}
    		}
    	};
//    	console.debug('AjaxGetV: '+url);
    	xmlhttp.open("GET",url,true);
    	fetchActive(true);
    	xmlhttp.send();
    }


//  ----------------------------------------------------------------------------------------
// AjaxGetImage:  long way around to get image header with timestamp
// this may not be reliable and portable:  have seen partial images chrome/Win8, no images android/std-browser...
// alternate: much simpler/reliable img.src=foo, deal with timestamps separately (also more compatible with webturbine...)
    var Tlast=0;
    nreq=0;
    this.AjaxGetImage = function(url,img,param) { 
		
    	if(debug) console.log('AjaxGetImage, url: '+url);
		
    	var instance = this;			// for reference inside onreadystatechange function
    	var xmlhttp=new XMLHttpRequest();
    	
    	xmlhttp.onreadystatechange=function() {
        	fetchActive(false);

    		if (xmlhttp.readyState==4) {    			
				if(debug) console.log("AjaxGetImage, got: "+url+", inprogress: "+instance.videoInProgress+", status: "+xmlhttp.status);
				instance.videoInProgress--;			// decremented in imgload()
				if(instance.videoInProgress < 0) instance.videoInProgress = 0;
				
				// got actual data
				if(xmlhttp.status == 200) {
					var wurl = window.URL || window.webkitURL;
					img.src = wurl.createObjectURL(new Blob([this.response], {type: "image/jpeg"}));
					if(debug) console.warn("img.src = new blob!  url: "+url+", length: "+xmlhttp.response.size);
				}
				
    			if(xmlhttp.status==200 || xmlhttp.status == 304) {
    				if(debug && isPause()) console.log('AjaxGetImage while paused! url: '+url);
    				if(debug && xmlhttp.status == 304) console.debug('got dupe for: '+url);
			
    				updateHeaderInfo(xmlhttp, url, param);				// update header info
    				lastmediaTime = gotTime[param];
    			}
    			else {
    				if(debug) console.log('Warning, xmlhttp.status: '+xmlhttp.status);
    				if(xmlhttp.status != 304) {			// skip over dupes
    					if((getTime() >= newestTime && top.rtflag!=RT) || (xmlhttp.status != 410 && xmlhttp.status != 404)) {	// keep going (over gaps)
    						if(debug) console.log('stopping on xmlhttp.status: '+xmlhttp.status+", time: "+getTime()+", newestTime: "+newestTime);
    						goPause();
    					}
    				}
    			}
    		}
    	}
    	
    	// HTTP GET
    	xmlhttp.open("GET",url,true);
    	xmlhttp.responseType = 'blob';
    	if(gotTime[param])
    		xmlhttp.setRequestHeader("If-None-Match", param+":"+Math.floor(gotTime[param]) );
    	
    	fetchActive(true);
    	xmlhttp.send();
    }
}

//----------------------------------------------------------------------------------------	
//parse HTTP header for time info, update globals

function updateHeaderInfo(xmlhttp, url, param) {	
	var newReq = (url.indexOf("r=newest") != -1);
	var oldReq = (url.indexOf("r=oldest") != -1);
	
	var tstamp = xmlhttp.getResponseHeader("time");								// float sec (with millisecond resolution)
	var tstamp2 = xmlhttp.getResponseHeader("Last-Modified");

	var holdest = xmlhttp.getResponseHeader("oldest");		
	if(holdest != null) {
		var Told = 1000 * Number(holdest);
		if(Told!=0 && ((oldestTime == 0 || Told < oldestTime) 
				|| param == plots[0].params[0])) 								// if first plot, first param, master set oldest/newest time
					oldestTime = Told;
	}

	var hnewest = xmlhttp.getResponseHeader("newest");		
	if(hnewest != null) {
		var Tnew = 1000 * Number(hnewest);
		if(Tnew > newestTime  || param == plots[0].params[0]) newestTime = Tnew;
	}
	else AjaxGetParamTimeNewest(param);		// if not in header, fetch as separate call (e.g. for DT)

	var hlag = Number(xmlhttp.getResponseHeader("lagtime"));
	if(debug) console.debug('updateHeader, url: '+url+', param: '+param+', tstamp: '+tstamp+", holdest: "+holdest+", hnewest: "+hnewest+", hlag: "+hlag+", dupe: "+(xmlhttp.status==304)+', newestTime: '+newestTime);

	if(tstamp != null) {
		var T = Math.floor(1000*parseFloat(tstamp));
		if(hnewest==null && newReq) newestTime = T;
		
		if(holdest==null && oldReq) oldestTime = T;			// just set it
//		{
//			if(T!=0 && (T < oldestTime || oldestTime==0)) oldestTime = T;
//		}
    	gotTime[param] = T;
    	lagTime[param] = hlag;
	}
}


