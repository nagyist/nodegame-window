/**
 * # GameWindow
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * GameWindow provides a handy API to interface nodeGame with the
 * browser window
 *
 * Creates a custom root element inside the HTML page, and insert an
 * iframe element inside it.
 *
 * Dynamic content can be loaded inside the iframe without losing the
 * javascript state inside the page.
 *
 * Defines a number of profiles associated with special page layout.
 *
 * Depends on JSUS and nodegame-client.
 */
(function(window, node) {

    "use strict";

    var J = node.JSUS;

    if (!J) {
        throw new Error('GameWindow: JSUS object not found. Aborting.');
    }

    var DOM = J.get('DOM');

    if (!DOM) {
        throw new Error('GameWindow: JSUS DOM object not found. Aborting.');
    }

    var constants = node.constants;
    var windowLevels = constants.windowLevels;
    var screenLevels = constants.screenLevels;

    var CB_EXECUTED = constants.stageLevels.CALLBACK_EXECUTED;

    var WIN_LOADING = windowLevels.LOADING;

    // Allows just one update at the time to the counter of loading frames.
    var lockedUpdate = false;

    GameWindow.prototype = DOM;
    GameWindow.prototype.constructor = GameWindow;

    // Configuration object.
    GameWindow.defaults = {};

    // Default settings.
    GameWindow.defaults.promptOnleaveText = '';
    GameWindow.defaults.promptOnleave = true;
    GameWindow.defaults.noEscape = true;
    GameWindow.defaults.waitScreen = undefined;
    GameWindow.defaults.disableRightClick = false;
    GameWindow.defaults.cacheDefaults = {
        loadCache:       true,
        storeCacheNow:   false,
        storeCacheLater: false
    };

    function onLoadStd(iframe, cb) {
        var iframeWin;
        iframeWin = iframe.contentWindow;

        function completed(event) {
            var iframeDoc;
            iframeDoc = J.getIFrameDocument(iframe);

            // Detaching the function to avoid double execution.
            iframe.removeEventListener('load', completed, false);
            iframeWin.removeEventListener('load', completed, false);
            if (cb) {
                // Some browsers fire onLoad too early.
                // A small timeout is enough.
                setTimeout(function() { cb(); }, 120);
            }
        }

        // Use the handy event callback
        iframe.addEventListener('load', completed, false);

        // A fallback to window.onload, that will always work
        iframeWin.addEventListener('load', completed, false);
    }

    function onLoadIE(iframe, cb) {
        var iframeWin;
        iframeWin = iframe.contentWindow;
        // We cannot get the iframeDoc here and use it in completed. See below.

        function completed(event) {
            var iframeDoc;

            // IE < 10 gives 'Permission Denied' if trying to access
            // the iframeDoc from the context of the function above.
            // We need to re-get it from the DOM.
            iframeDoc = J.getIFrameDocument(iframe);

            // readyState === "complete" works also in oldIE.
            if (event.type === 'load' ||
                iframeDoc.readyState === 'complete') {

                // Detaching the function to avoid double execution.
                iframe.detachEvent('onreadystatechange', completed );
                iframeWin.detachEvent('onload', completed );

                if (cb) {
                    // Some browsers fire onLoad too early.
                    // A small timeout is enough.
                    setTimeout(function() { cb(); }, 120);
                }
            }
        }

        // Ensure firing before onload, maybe late but safe also for iframes.
        iframe.attachEvent('onreadystatechange', completed);

        // A fallback to window.onload, that will always work.
        iframeWin.attachEvent('onload', completed);
    }

    function onLoad(iframe, cb) {
        // IE
        if (W.isIE) {
            onLoadIE(iframe, cb);
        }
        // Standards-based browsers support DOMContentLoaded.
        else {
            onLoadStd(iframe, cb);
        }
    }

    /**
     * ## GameWindow constructor
     *
     * Creates the GameWindow object
     *
     * @see GameWindow.init
     */
    function GameWindow() {
        this.setStateLevel('UNINITIALIZED');

        if ('undefined' === typeof window) {
            throw new Error('GameWindow: no window found. Are you in a ' +
                            'browser?');
        }

        if ('undefined' === typeof node) {
            throw new Error('GameWindow: nodeGame not found');
        }

        node.silly('node-window: loading...');

        /**
         * ### GameWindow.frameName
         *
         * The name (and also id) of the iframe where the pages are loaded
         */
        this.frameName = null;

        /**
         * ### GameWindow.frameElement
         *
         * A reference to the iframe object of type _HTMLIFrameElement_
         *
         * You can get this element also by:
         *
         * - document.getElementById(this.frameName)
         *
         * This is the element that contains the _Window_ object of the iframe.
         *
         * @see this.frameName
         * @see this.frameWindow
         * @see this.frameDocument
         */
        this.frameElement = null;

        /**
         * ### GameWindow.frameWindow
         *
         * A reference to the iframe Window object
         *
         * You can get this element also by:
         *
         * - window.frames[this.frameName]
         */
        this.frameWindow = null;

        /**
         * ### GameWindow.frameDocument
         *
         * A reference to the iframe Document object
         *
         * You can get this element also by:
         *
         * - JSUS.getIFrameDocument(this.frameElement)
         *
         * @see this.frameElement
         * @see this.frameWindow
         */
        this.frameDocument = null;

        /**
         * ### GameWindow.root
         *
         * A reference to the HTML element to which the iframe is appended
         *
         * Under normal circumstances, this element is a reference to
         * _document.body_.
         */
        this.frameRoot = null;

        /**
         * ### GameWindow.headerElement
         *
         * A reference to the HTMLDivElement representing the header
         */
        this.headerElement = null;

        /**
         * ### GameWindow.headerName
         *
         * The name (id) of the header element
         */
        this.headerName = null;

        /**
         * ### GameWindow.headerRoot
         *
         * The name (id) of the header element
         */
        this.headerRoot = null;

        /**
         * ### GameWindow.headerPosition
         *
         * The relative position of the header on the screen
         *
         * Available positions: 'top', 'bottom', 'left', 'right'.
         *
         * @see GameWindow.setHeaderPosition
         */
        this.headerPosition = null;

        /**
         * ### GameWindow.defaultHeaderPosition
         *
         * The default header position. 'left'.
         */
        this.defaultHeaderPosition = 'left';

        /**
         * ### GameWindow.conf
         *
         * Object containing the current configuration
         */
        this.conf = {};

        /**
         * ### GameWindow.uriChannel
         *
         * The uri of the channel on the server
         *
         * It is not the socket.io channel, but the HTTP address.
         *
         * @see GameWindow.loadFrame
         */
        this.uriChannel = null;

        /**
         * ### GameWindow.areLoading
         *
         * The number of frames currently being loaded
         */
        this.areLoading = 0;

        /**
         * ### GameWindow.cacheSupported
         *
         * Flag that marks whether caching is supported by the browser
         *
         * Caching requires to modify the documentElement.innerHTML property
         * of the iframe document, which is read-only in IE < 9.
         */
        this.cacheSupported = null;

        /**
         * ### GameWindow.cache
         *
         * Cache for loaded iframes
         *
         * Maps URI to a cache object with the following properties:
         *
         * - `contents` (the innerHTML property or null if not cached)
         * - optionally 'cacheOnClose' (a bool telling whether to cache
         *   the frame when it is replaced by a new one)
         */
        this.cache = {};

        /**
         * ### GameWindow.currentURIs
         *
         * Currently loaded URIs in the internal frames
         *
         * Maps frame names (e.g. 'ng_mainframe') to the URIs they are showing.
         *
         * @see GameWindow.preCache
         */
        this.currentURIs = {};

        /**
         * ### GameWindow.globalLibs
         *
         * Array of strings with the path of the libraries
         * to be loaded in every frame
         */
        this.globalLibs = [];

        /**
         * ### GameWindow.frameLibs
         *
         * The libraries to be loaded in specific frames
         *
         * Maps frame names to arrays of strings. These strings are the
         * libraries that should be loaded for a frame.
         *
         * @see GameWindow.globalLibs
         */
        this.frameLibs = {};

        /**
         * ### GameWindow.uriPrefix
         *
         * A prefix added to every loaded uri that does not begin with `/`
         *
         * Useful for example to add a language path (e.g. a language
         * directory) that matches a specific context of a view.
         *
         * @see GameWindow.loadFrame
         * @see LanguageSelector (widget)
         */
        this.uriPrefix = null;

        /**
         * ### GameWindow.stateLevel
         *
         * The window's state level
         *
         * @see constants.windowLevels
         */
        this.stateLevel = null;

        /**
         * ### GameWindow.waitScreen
         *
         * Reference to the _WaitScreen_ module
         *
         * @see node.widgets.WaitScreen
         */
        this.waitScreen = null;

        /**
         * ### GameWindow.listenersAdded
         *
         * TRUE, if listeners were added already
         *
         * @see GameWindow.addDefaultListeners
         */
        this.listenersAdded = null;

        /**
         * ### GameWindow.screenState
         *
         * Level describing whether the user can interact with the frame
         *
         * The _screen_ represents all the user can see on screen.
         * It includes the _frame_ area, but also the _header_.
         *
         * @see node.widgets.WaitScreen
         * @see node.constants.screenLevels
         */
        this.screenState = node.constants.screenLevels.ACTIVE;

        /**
         * ### GameWindow.isIE
         *
         * Boolean flag saying whether we are in IE or not
         */
        this.isIE = !!document.createElement('span').attachEvent;

        // Add setup functions.
        this.addDefaultSetups();

        // Adding listeners.
        this.addDefaultListeners();

        // Hide <noscript> tag (necessary for IE8).
        setTimeout(function(){
            (function (scriptTag) {
                if (scriptTag.length >= 1) scriptTag[0].style.display = 'none';
            })(document.getElementsByTagName('noscript'));
        }, 1000);

        // Init.
        this.init(GameWindow.defaults);

        node.silly('node-window: created.');
    }

    // ## GameWindow methods

    /**
     * ### GameWindow.init
     *
     * Sets global variables based on local configuration
     *
     * Defaults:
     *  - promptOnleave TRUE
     *  - captures ESC key
     *
     * @param {object} options Optional. Configuration options
     */
    GameWindow.prototype.init = function(options) {
        var stageLevels;
        var stageLevel;

        this.setStateLevel('INITIALIZING');
        options = options || {};
        this.conf = J.merge(this.conf, options);

        if (this.conf.promptOnleave) {
            this.promptOnleave();
        }
        else if (this.conf.promptOnleave === false) {
            this.restoreOnleave();
        }

        if (this.conf.noEscape) {
            this.noEscape();
        }
        else if (this.conf.noEscape === false) {
            this.restoreEscape();
        }

        if (this.conf.waitScreen !== false) {
            if (this.waitScreen) {
                this.waitScreen.destroy();
                this.waitScreen = null;
            }
            this.waitScreen = new node.WaitScreen(this.conf.waitScreen);

            stageLevels = constants.stageLevels;
            stageLevel = node.game.getStageLevel();
            if (stageLevel !== stageLevels.UNINITIALIZED) {
                if (node.game.paused) {
                    this.lockScreen(this.waitScreen.defaultTexts.paused);
                }
                else {
                    if (stageLevel === stageLevels.DONE) {
                        this.lockScreen(this.waitScreen.defaultTexts.waiting);
                    }
                    else if (stageLevel !== stageLevels.PLAYING) {
                        this.lockScreen(this.waitScreen.defaultTexts.stepping);
                    }
                }
            }
        }
        else if (this.waitScreen) {
            this.waitScreen.destroy();
            this.waitScreen = null;
        }

        if (this.conf.defaultHeaderPosition) {
            this.defaultHeaderPosition = this.conf.defaultHeaderPosition;
        }

        if (this.conf.disableRightClick) {
            this.disableRightClick();
        }
        else if (this.conf.disableRightClick === false) {
            this.enableRightClick();
        }

        if ('undefined' !== typeof this.conf.uriPrefix) {
            this.setUriPrefix(this.conf.uriPrefix);
        }

        this.setStateLevel('INITIALIZED');

        node.silly('node-window: inited.');
    };

    /**
     * ### GameWindow.reset
     *
     * Resets the GameWindow to the initial state
     *
     * Clears the frame, header, lock, widgets and cache.
     *
     * @see Widgets.destroyAll
     */
    GameWindow.prototype.reset = function() {
        // Unlock screen, if currently locked.
        if (this.isScreenLocked()) {
            this.unlockScreen();
        }

        // Remove widgets, if Widgets exists.
        if (node.widgets) {
            node.widgets.destroyAll();
        }

        // Remove loaded frame, if one is found.
        if (this.getFrame()) {
            this.destroyFrame();
        }

        // Remove header, if one is found.
        if (this.getHeader()) {
            this.destroyHeader();
        }

        this.areLoading = 0;

        // Clear all caches.
        this.clearCache();

        node.silly('node-window: reseted.');
    };

    /**
     * ### GameWindow.setStateLevel
     *
     * Validates and sets window's state level
     *
     * @param {string} level The level of the update
     *
     * @see constants.windowLevels
     */
    GameWindow.prototype.setStateLevel = function(level) {
        if ('string' !== typeof level) {
            throw new TypeError('GameWindow.setStateLevel: ' +
                                'level must be string.');
        }
        if ('undefined' === typeof windowLevels[level]) {
            throw new Error('GameWindow.setStateLevel: unrecognized level: ' +
                            level + '.');
        }

        this.stateLevel = windowLevels[level];
    };

    /**
     * ### GameWindow.getStateLevel
     *
     * Returns the current state level
     *
     * @return {number} The state level
     *
     * @see constants.windowLevels
     */
    GameWindow.prototype.getStateLevel = function() {
        return this.stateLevel;
    };

    /**
     * ### GameWindow.isReady
     *
     * Returns TRUE if the GameWindow is ready
     *
     * The window is ready if its state is either INITIALIZED or LOADED.
     *
     * @return {boolean} TRUE if the window is ready
     */
    GameWindow.prototype.isReady = function() {
        return this.stateLevel === windowLevels.LOADED ||
            this.stateLevel === windowLevels.INITIALIZED;
    };

    /**
     * ### GameWindow.setScreenLevel
     *
     * Validates and sets window's state level
     *
     * @param {string} level The level of the update
     *
     * @see constants.screenLevels
     */
    GameWindow.prototype.setScreenLevel = function(level) {
        if ('string' !== typeof level) {
            throw new TypeError('GameWindow.setScreenLevel: ' +
                                'level must be string.');
        }
        if ('undefined' === typeof screenLevels[level]) {
            throw new Error('GameWindow.setScreenLevel: unrecognized level: ' +
                            level + '.');
        }

        this.screenState = screenLevels[level];
    };

    /**
     * ### GameWindow.getScreenLevel
     *
     * Returns the current screen level
     *
     * @return {number} The screen level
     *
     * @see constants.screenLevels
     */
    GameWindow.prototype.getScreenLevel = function() {
        return this.screenState;
    };

    /**
     * ### GameWindow.getFrame
     *
     * Returns a reference to the HTML element of the frame of the game
     *
     * If no reference is found, tries to retrieve and update it using the
     * _frameName_ variable.
     *
     * @return {HTMLIFrameElement} The iframe element of the game
     *
     * @see GameWindow.frameName
     */
    GameWindow.prototype.getFrame = function() {
        if (!this.frameElement) {
            if (this.frameName) {
                this.frameElement = document.getElementById(this.frameName);
            }
        }
        return this.frameElement;
    };

    /**
     * ### GameWindow.getFrameName
     *
     * Returns the name of the frame of the game
     *
     * If no name is found, tries to retrieve and update it using the
     *  _GameWindow.getFrame()_.
     *
     * @return {string} The name of the frame of the game.
     *
     * @see GameWindow.getFrame
     */
    GameWindow.prototype.getFrameName = function() {
        var iframe;
        if (!this.frameName || this.stateLevel === WIN_LOADING) {
            iframe = this.getFrame();
            this.frameName = iframe ? iframe.name || iframe.id : null;
        }
        return this.frameName;
    };

    /**
     * ### GameWindow.getFrameWindow
     *
     * Returns a reference to the window object of the frame of the game
     *
     * If no reference is found, tries to retrieve and update it using
     * _GameWindow.getFrame()_.
     *
     * @return {Window} The window object of the iframe of the game
     *
     * @see GameWindow.getFrame
     */
    GameWindow.prototype.getFrameWindow = function() {
        var iframe;
        if (!this.frameWindow || this.stateLevel === WIN_LOADING) {
            iframe = this.getFrame();
            this.frameWindow = iframe ? iframe.contentWindow : null;
        }
        return this.frameWindow;
    };

    /**
     * ### GameWindow.getFrameDocument
     *
     * Returns a reference to the document object of the iframe
     *
     * If no reference is found, tries to retrieve and update it using the
     * _GameWindow.getFrame()_.
     *
     * @return {Document} The document object of the iframe of the game
     *
     * @see GameWindow.getFrame
     */
    GameWindow.prototype.getFrameDocument = function() {
        var iframe;
        if (!this.frameDocument || this.stateLevel === WIN_LOADING) {
            iframe = this.getFrame();
            this.frameDocument = iframe ? this.getIFrameDocument(iframe) :
                null;
        }
        return this.frameDocument;

    };

    /**
     * ### GameWindow.getFrameRoot
     *
     * Returns a reference to the root element for the iframe
     *
     * If none is found tries to retrieve and update it using
     * _GameWindow.getFrame()_.
     *
     * @return {Element} The root element in the iframe
     */
    GameWindow.prototype.getFrameRoot = function() {
        var iframe;
        if (!this.frameRoot) {
            iframe = this.getFrame();
            this.frameRoot = iframe ? iframe.parentNode : null;
        }
        return this.frameRoot;
    };

    /**
     * ### GameWindow.generateFrame
     *
     * Appends a new iframe to _documents.body_ and sets it as the default one
     *
     * @param {Element} root Optional. The HTML element to which the iframe
     *   will be appended. Default: this.frameRoot or document.body
     * @param {string} frameName Optional. The name of the iframe. Default:
     *   'ng_mainframe'
     * @param {boolean} force Optional. Will create the frame even if an
     *   existing one is found. Default: FALSE
     *
     * @return {IFrameElement} The newly created iframe
     *
     * @see GameWindow.frameElement
     * @see GameWindow.frameWindow
     * @see GameWindow.frameDocument
     * @see GameWindow.setFrame
     * @see GameWindow.clearFrame
     * @see GameWindow.destroyFrame
     */
    GameWindow.prototype.generateFrame = function(root, frameName, force) {
        var iframe;
        if (!force && this.frameElement) {
            throw new Error('GameWindow.generateFrame: a frame element is ' +
                            'already existing. It cannot be duplicated.');
        }

        root = root || this.frameRoot || document.body;

        if (!J.isElement(root)) {
            throw new Error('GameWindow.generateFrame: invalid root element.');
        }

        frameName = frameName || 'ng_mainframe';

        if ('string' !== typeof frameName) {
            throw new Error('GameWindow.generateFrame: frameName must be ' +
                            'string.');
        }

        if (document.getElementById(frameName)) {
            throw new Error('GameWindow.generateFrame: frameName must be ' +
                            'unique.');
        }

        iframe = W.addIFrame(root, frameName);
        // Method .replace does not add the uri to the history.
        iframe.contentWindow.location.replace('about:blank');

        // For IE8.
        iframe.frameBorder = 0;

        this.setFrame(iframe, frameName, root);

        if (this.frameElement) {
            adaptFrame2HeaderPosition(this);
        }

        return iframe;
    };

    /**
     * ### GameWindow.setFrame
     *
     * Sets the new default frame and update other references
     *
     * @param {IFrameElement} iframe The new default frame
     * @param {string} frameName The name of the iframe
     * @param {Element} root The HTML element to which the iframe is appended
     *
     * @return {IFrameElement} The new default iframe
     *
     * @see GameWindow.generateFrame
     */
    GameWindow.prototype.setFrame = function(iframe, iframeName, root) {
        if (!J.isElement(iframe)) {
            throw new Error('GameWindow.setFrame: iframe must be HTMLElement.');
        }
        if ('string' !== typeof iframeName) {
            throw new Error('GameWindow.setFrame: iframeName must be string.');
        }
        if (!J.isElement(root)) {
            throw new Error('GameWindow.setFrame: invalid root element.');
        }

        this.frameRoot = root;
        this.frameName = iframeName;
        this.frameElement = iframe;
        this.frameWindow = iframe.contentWindow;
        this.frameDocument = W.getIFrameDocument(iframe);

        return iframe;
    };

    /**
     * ### GameWindow.destroyFrame
     *
     * Clears the content of the frame and removes the element from the page
     *
     * @see GameWindow.clearFrame
     */
    GameWindow.prototype.destroyFrame = function() {
        this.clearFrame();
        if (this.frameRoot) this.frameRoot.removeChild(this.frameElement);
        this.frameElement = null;
        this.frameWindow = null;
        this.frameDocument = null;
        this.frameRoot = null;
    };

    /**
     * ### GameWindow.clearFrame
     *
     * Clears the content of the frame
     */
    GameWindow.prototype.clearFrame = function() {
        var iframe, frameName;
        iframe = this.getFrame();
        if (!iframe) {
            throw new Error('GameWindow.clearFrame: cannot detect frame.');
        }

        frameName = iframe.name || iframe.id;
        iframe.onload = null;

        // Method .replace does not add the uri to the history.
        //iframe.contentWindow.location.replace('about:blank');

        try {
            this.getFrameDocument().documentElement.innerHTML = '';
        }
        catch(e) {
            // IE < 10 gives 'Permission Denied' if trying to access
            // the iframeDoc from the context of the function above.
            // We need to re-get it from the DOM.
            if (J.getIFrameDocument(iframe).documentElement) {
                J.removeChildrenFromNode(
                    J.getIFrameDocument(iframe).documentElement);
            }
        }

        this.frameElement = iframe;
        this.frameWindow = window.frames[frameName];
        this.frameDocument = W.getIFrameDocument(iframe);
    };

    /**
     * ### GameWindow.generateHeader
     *
     * Adds a a div element and sets it as the header of the page
     *
     * @param {Element} root Optional. The HTML element to which the header
     *   will be appended. Default: _document.body_ or
     *   _document.lastElementChild_
     * @param {string} headerName Optional. The name (id) of the header.
     *   Default: 'gn_header'
     * @param {boolean} force Optional. Will create the header even if an
     *   existing one is found. Default: FALSE
     *
     * @return {Element} The header element
     */
    GameWindow.prototype.generateHeader = function(root, headerName, force) {
        var header;

        if (!force && this.headerElement) {
            throw new Error('GameWindow.generateHeader: a header element is ' +
                            'already existing. It cannot be duplicated.');
        }

        root = root || document.body || document.lastElementChild;

        if (!J.isElement(root)) {
            throw new Error('GameWindow.generateHeader: invalid root element.');
        }

        headerName = headerName || 'ng_header';

        if ('string' !== typeof headerName) {
            throw new Error('GameWindow.generateHeader: headerName must be ' +
                            'string.');
        }

        if (document.getElementById(headerName)) {
            throw new Error('GameWindow.generateHeader: headerName must be ' +
                            'unique.');
        }

        header = this.addElement('div', root, headerName);

        // If generateHeader is called after generateFrame, and the default
        // header position is not bottom, we need to move the header in front.
        if (this.frameElement && this.defaultHeaderPosition !== 'bottom') {
            this.getFrameRoot().insertBefore(header, this.frameElement);
        }

        this.setHeader(header, headerName, root);
        this.setHeaderPosition(this.defaultHeaderPosition);

        return header;
    };


    /**
     * ### GameWindow.setHeaderPosition
     *
     * Sets the header's position on the screen
     *
     * Positioning of the frame element is also affected, if existing, or if
     * added later.
     *
     * @param {string} position New position, one of
     *   'top', 'bottom', 'left', 'right'
     *
     * @see GameWindow.generateHeader
     * @see GameWindow.headerPosition
     * @see GameWindow.defaultHeaderPosition
     * @see adaptFrame2HeaderPosition
     */
    GameWindow.prototype.setHeaderPosition = function(position) {
        var validPositions, pos, oldPos;
        if ('string' !== typeof position) {
            throw new TypeError('GameWindow.setHeaderPosition: position ' +
                                'must be string.');
        }
        pos = position.toLowerCase();

        // Do something only if there is a change in the position.
        if (this.headerPosition === pos) return;

        // Map: position - css class.
        validPositions = {
            'top': 'ng_header_position-horizontal-t',
            'bottom': 'ng_header_position-horizontal-b',
            'right': 'ng_header_position-vertical-r',
            'left': 'ng_header_position-vertical-l'
        };

        if ('undefined' === typeof validPositions[pos]) {
            node.err('GameWindow.setHeaderPosition: invalid header ' +
                     'position: ' + pos  + '.');
            return;
        }
        if (!this.headerElement) {
            throw new Error('GameWindow.setHeaderPosition: headerElement ' +
                            'not found.');
        }

        W.removeClass(this.headerElement, 'ng_header_position-[a-z-]*');
        W.addClass(this.headerElement, validPositions[pos]);

        oldPos = this.headerPosition;

        // Store the new position in a reference variable
        // **before** adaptFrame2HeaderPosition is called
        this.headerPosition = pos;

        if (this.frameElement) {
            adaptFrame2HeaderPosition(this, oldPos);
        }
    };

    /**
     * ### GameWindow.setHeader
     *
     * Sets the new header element and update related references
     *
     * @param {Element} header The new header
     * @param {string} headerName The name of the header
     * @param {Element} root The HTML element to which the header is appended
     *
     * @return {Element} The new header
     *
     * @see GameWindow.generateHeader
     */
    GameWindow.prototype.setHeader = function(header, headerName, root) {
        if (!J.isElement(header)) {
            throw new Error(
                'GameWindow.setHeader: header must be HTMLElement.');
        }
        if ('string' !== typeof headerName) {
            throw new Error('GameWindow.setHeader: headerName must be string.');
        }
        if (!J.isElement(root)) {
            throw new Error('GameWindow.setHeader: invalid root element.');
        }

        this.headerElement = header;
        this.headerName = headerName;
        this.headerRoot = root;

        return this.headerElement;
    };

    /**
     * ### GameWindow.getHeader
     *
     * Returns a reference to the header element, if defined
     *
     * @return {Element} The header element
     */
    GameWindow.prototype.getHeader = function() {
        if (!this.headerElement) {
            this.headerElement = this.headerName ?
                document.getElementById(this.headerName) : null;
        }
        return this.headerElement;
    };

    /**
     * ### GameWindow.getHeaderName
     *
     * Returns the name (id) of the header element
     *
     * @return {string} The name (id) of the header
     */
    GameWindow.prototype.getHeaderName = function() {
        var header;
        if (!this.headerName) {
            header = this.getHeader();
            this.headerName = header ? header.id : null;
        }
        return this.headerName;
    };

    /**
     * ### GameWindow.getHeaderRoot
     *
     * Returns the HTML element to which the header is appended
     *
     * @return {HTMLElement} The HTML element to which the header is appended
     */
    GameWindow.prototype.getHeaderRoot = function() {
        var header;
        if (!this.headerRoot) {
            header = this.getHeader();
            this.headerRoot = header ? header.parentNode: null;
        }
        return this.headerRoot;
    };

    /**
     * ### GameWindow.destroyHeader
     *
     * Clears the content of the header and removes the element from the page
     *
     * @see GameWindow.clearHeader
     */
    GameWindow.prototype.destroyHeader = function() {
        this.clearHeader();
        this.headerRoot.removeChild(this.headerElement);
        this.headerElement = null;
        this.headerName = null;
        this.headerRoot = null;
        this.headerPosition = null;
    };

    /**
     * ### GameWindow.clearHeader
     *
     * Clears the content of the header
     */
    GameWindow.prototype.clearHeader = function() {
        var header;
        header = this.getHeader();
        if (!header) {
            throw new Error('GameWindow.clearHeader: cannot detect header.');
        }
        this.headerElement.innerHTML = '';
    };

    /**
     * ### GameWindow.initLibs
     *
     * Specifies the libraries to be loaded automatically in the iframe
     *
     * Multiple calls to _initLibs_ append the new libs to the list.
     * Deletion must be done manually.
     *
     * This method must be called before any call to GameWindow.loadFrame.
     *
     * @param {array} globalLibs Array of strings describing absolute library
     *   paths that should be loaded in every iframe
     * @param {object} frameLibs Map from URIs to string arrays (as above)
     *   specifying libraries that should only be loaded for iframes displaying
     *   the given URI. This must not contain any elements that are also in
     *   globalLibs.
     */
    GameWindow.prototype.initLibs = function(globalLibs, frameLibs) {
        if (globalLibs && !J.isArray(globalLibs)) {
            throw new TypeError('GameWindow.initLibs: globalLibs must be ' +
                                'array or undefined.');
        }
        if (frameLibs && 'object' !== typeof frameLibs) {
            throw new TypeError('GameWindow.initLibs: frameLibs must be ' +
                                'object or undefined.');
        }
        if (!globalLibs && !frameLibs) {
            throw new Error('GameWindow.initLibs: frameLibs and frameLibs ' +
                            'cannot be both undefined.');
        }
        this.globalLibs = this.globalLibs.concat(globalLibs || []);
        J.mixin(this.frameLibs, frameLibs);
    };

    /**
     * ### GameWindow.preCacheTest
     *
     * Tests whether preChace is supported by the browser
     *
     * Results are stored in _GameWindow.cacheSupported_.
     *
     * @param {function} cb Optional. The function to call once the test if
     *   finished. It will be called regardless of success or failure.
     * @param {string} uri Optional. The URI to test. Default:
     *   '/pages/testpage.htm'
     *
     * @see GameWindow.cacheSupported
     */
    GameWindow.prototype.preCacheTest = function(cb, uri) {
        var iframe, iframeName;
        uri = uri || '/pages/testpage.htm';
        if ('string' !== typeof uri) {
            throw new TypeError('GameWindow.precacheTest: uri must string or ' +
                                'undefined.');
        }
        iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframeName = 'preCacheTest';
        iframe.id = iframeName;
        iframe.name = iframeName;
        document.body.appendChild(iframe);
        iframe.contentWindow.location.replace(uri);
        onLoad(iframe, function() {
            //var iframe, docElem;
            try {
                W.getIFrameDocument(iframe).documentElement.innerHTML = 'a';
                // This passes in IE8, but the rest of the caching doesn't.
                // We want this test to fail in IE8.
                //iframe = document.getElementById(iframeName);
                //docElem = W.getIFrameDocument(iframe);
                //docElem.innerHTML = 'a';
                W.cacheSupported = true;
            }
            catch(e) {
                W.cacheSupported = false;
            }
            document.body.removeChild(iframe);
            if (cb) cb();
        });
    };

    /**
     * ### GameWindow.preCache
     *
     * Loads the HTML content of the given URI(s) into the cache
     *
     * If caching is not supported by the browser, the callback will be
     * executed anyway.
     *
     * All uri to precache are parsed with `GameWindow.processUri` before
     * being loaded.
     *
     * @param {string|array} uris The URI(s) to cache
     * @param {function} callback Optional. The function to call once the
     *   caching is done
     *
     * @see GameWindow.cacheSupported
     * @see GameWindow.preCacheTest
     * @see GameWindow.processUri
     */
    GameWindow.prototype.preCache = function(uris, callback) {
        var that;
        var loadedCount;
        var currentUri, uriIdx;
        var iframe, iframeName;

        if ('string' === typeof uris) {
            uris = [ uris ];
        }

        if (!J.isArray(uris)) {
            throw new TypeError('GameWindow.preCache: uris must be string ' +
                                'or array.');
        }
        if (callback && 'function' !== typeof callback) {
            throw new TypeError('GameWindow.preCache: callback must be ' +
                                'function or undefined.');
        }

        // Don't preload if an empty array is passed.
        if (!uris.length) {
            if (callback) callback();
            return;
        }

        that = this;

        // Before proceeding with caching, check if caching is supported.
        if (this.cacheSupported === null) {
            this.preCacheTest(function() {
                that.preCache(uris, callback);
            });
            return;
        }
        else if (this.cacheSupported === false) {
            node.warn('GameWindow.preCache: caching is not supported by ' +
                      'your browser.');
            if (callback) callback();
            return;
        }

        // Keep count of loaded URIs:
        loadedCount = 0;

        for (uriIdx = 0; uriIdx < uris.length; uriIdx++) {
            currentUri = this.processUri(uris[uriIdx]);

            // Create an invisible internal frame for the current URI:
            iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframeName = 'tmp_iframe_' + uriIdx;
            iframe.id = iframeName;
            iframe.name = iframeName;
            document.body.appendChild(iframe);

            (function(uri, thisIframe) {
                // Register the onLoad handler:
                onLoad(thisIframe, function() {
                    var frameDocument, frameDocumentElement;

                    frameDocument = W.getIFrameDocument(thisIframe);
                    frameDocumentElement = frameDocument.documentElement;

                    // Store the contents in the cache:
                    that.cache[uri] = {
                        contents: frameDocumentElement.innerHTML,
                        cacheOnClose: false
                    };

                    // Remove the internal frame:
                    document.body.removeChild(thisIframe);

                    // Increment loaded URIs counter:
                    loadedCount++;
                    if (loadedCount >= uris.length) {
                        // All requested URIs have been loaded at this point.
                        if (callback) callback();
                    }
                });
            })(currentUri, iframe);

            // Start loading the page:
            // Method .replace does not add the uri to the history.
            window.frames[iframeName].location.replace(currentUri);
        }
    };

    /**
     * ### GameWindow.clearCache
     *
     * Empties the cache
     */
    GameWindow.prototype.clearCache = function() {
        this.cache = {};
    };

    /**
     * ### GameWindow.getElementById
     *
     * Returns the element with the given id
     *
     * Looks first into the iframe and then into the rest of the page.
     *
     * @param {string} id The id of the element
     *
     * @return {Element|null} The element in the page, or null if none is found
     *
     * @see GameWindow.getElementsByTagName
     */
    GameWindow.prototype.getElementById = function(id) {
        var el, frameDocument;

        frameDocument = this.getFrameDocument();
        el = null;
        if (frameDocument && frameDocument.getElementById) {
            el = frameDocument.getElementById(id);
        }
        if (!el) {
            el = document.getElementById(id);
        }
        return el;
    };

    /**
     * ### GameWindow.getElementsByTagName
     *
     * Returns a list of elements with the given tag name
     *
     * Looks first into the iframe and then into the rest of the page.
     *
     * @param {string} tag The tag of the elements
     *
     * @return {array|null} The elements in the page, or null if none is found
     *
     * @see GameWindow.getElementById
     */
    GameWindow.prototype.getElementsByTagName = function(tag) {
        var frameDocument;
        frameDocument = this.getFrameDocument();
        return frameDocument ? frameDocument.getElementsByTagName(tag) :
            document.getElementsByTagName(tag);
    };

    /**
     * ### GameWindow.loadFrame
     *
     * Loads content from an uri (remote or local) into the iframe,
     * and after it is loaded executes the callback function
     *
     * The third parameter is an options object with the following fields
     * (any fields left out assume the default setting):
     *
     *  - cache (object): Caching options. Fields:
     *      * loadMode (string):
     *          'cache' (default; get the page from cache if possible),
     *          'reload' (reload page without the cache)
     *      * storeMode (string):
     *          'off' (default; don't cache page),
     *          'onLoad' (cache given page after it is loaded),
     *          'onClose' (cache given page after it is replaced by a new page)
     *
     * Warning: Security policies may block this method if the content is
     * coming from another domain.
     * Notice: If called multiple times within the same stage/step, it will
     * cause the `VisualTimer` widget to reload the timer.
     *
     * @param {string} uri The uri to load
     * @param {function} func Optional. The function to call once the DOM is
     *   ready
     * @param {object} opts Optional. The options object
     *
     * @see GameWindow.uriPrefix
     * @see GameWindow.uriChannel
     */
    GameWindow.prototype.loadFrame = function(uri, func, opts) {
        var that;
        var loadCache;
        var storeCacheNow, storeCacheLater;
        var iframe, iframeName, iframeDocument, iframeWindow;
        var frameDocumentElement, frameReady;
        var lastURI;

        if ('string' !== typeof uri) {
            throw new TypeError('GameWindow.loadFrame: uri must be string.');
        }
        if (func && 'function' !== typeof func) {
            throw new TypeError('GameWindow.loadFrame: func must be function ' +
                                'or undefined.');
        }
        if (opts && 'object' !== typeof opts) {
            throw new TypeError('GameWindow.loadFrame: opts must be object ' +
                                'or undefined.');
        }
        opts = opts || {};

        iframe = this.getFrame();
        iframeName = this.frameName;

        if (!iframe) {
            throw new Error('GameWindow.loadFrame: no frame found.');
        }

        if (!iframeName) {
            throw new Error('GameWindow.loadFrame: frame has no name.');
        }

        this.setStateLevel('LOADING');
        that = this;

        // Save ref to iframe window for later.
        iframeWindow = iframe.contentWindow;
        // Query readiness (so we know whether onload is going to be called):
        iframeDocument = W.getIFrameDocument(iframe);
        frameReady = iframeDocument.readyState;
        // ...reduce it to a boolean:
        //frameReady = frameReady === 'interactive'||frameReady === 'complete';
        frameReady = frameReady === 'complete';

        // Begin loadFrame caching section.

        // Default options.
        loadCache = GameWindow.defaults.cacheDefaults.loadCache;
        storeCacheNow = GameWindow.defaults.cacheDefaults.storeCacheNow;
        storeCacheLater = GameWindow.defaults.cacheDefaults.storeCacheLater;

        // Caching options.
        if (opts.cache) {
            if (opts.cache.loadMode) {
                if (opts.cache.loadMode === 'reload') {
                    loadCache = false;
                }
                else if (opts.cache.loadMode === 'cache') {
                    loadCache = true;
                }
                else {
                    throw new Error('GameWindow.loadFrame: unkown cache ' +
                                    'load mode: ' + opts.cache.loadMode + '.');
                }
            }
            if (opts.cache.storeMode) {
                if (opts.cache.storeMode === 'off') {
                    storeCacheNow = false;
                    storeCacheLater = false;
                }
                else if (opts.cache.storeMode === 'onLoad') {
                    storeCacheNow = true;
                    storeCacheLater = false;
                }
                else if (opts.cache.storeMode === 'onClose') {
                    storeCacheNow = false;
                    storeCacheLater = true;
                }
                else {
                    throw new Error('GameWindow.loadFrame: unkown cache ' +
                                    'store mode: ' + opts.cache.storeMode +
                                    '.');
                }
            }
        }

        // Adapt the uri if necessary.
        uri = this.processUri(uri);

        if (this.cacheSupported === null) {
            this.preCacheTest(function() {
                that.loadFrame(uri, func, opts);
            });
            return;
        }

        if (this.cacheSupported === false) {
            storeCacheNow = false;
            storeCacheLater = false;
            loadCache = false;
        }
        else {
            // If the last frame requested to be cached on closing, do that:
            lastURI = this.currentURIs[iframeName];

            if (this.cache.hasOwnProperty(lastURI) &&
                this.cache[lastURI].cacheOnClose) {

                frameDocumentElement = iframeDocument.documentElement;
                this.cache[lastURI].contents = frameDocumentElement.innerHTML;
            }

            // Create entry for this URI in cache object
            // and store cacheOnClose flag:
            if (!this.cache.hasOwnProperty(uri)) {
                this.cache[uri] = { contents: null, cacheOnClose: false };
            }
            this.cache[uri].cacheOnClose = storeCacheLater;

            // Disable loadCache if contents aren't cached:
            if (this.cache[uri].contents === null) loadCache = false;
        }

        // End loadFrame caching section.

        // Update frame's currently showing URI:
        this.currentURIs[iframeName] = uri;

        // Keep track of nested call to loadFrame.
        updateAreLoading(this, 1);

        // Add the onLoad event listener:
        if (!loadCache || !frameReady) {
            onLoad(iframe, function() {
                // Handles caching.
                handleFrameLoad(that, uri, iframe, iframeName, loadCache,
                                storeCacheNow, function() {

                                    // Executes callback
                                    // and updates GameWindow state.
                                    that.updateLoadFrameState(func);
                                });
            });
        }

        // Cache lookup:
        if (loadCache) {
            // Load iframe contents at this point only if the iframe is already
            // "ready" (see definition of frameReady), otherwise the contents
            // would be cleared once the iframe becomes ready.  In that case,
            // iframe.onload handles the filling of the contents.
            if (frameReady) {
                // Handles caching.
                handleFrameLoad(this, uri, iframe, iframeName, loadCache,
                                storeCacheNow, function() {

                                    // Executes callback
                                    // and updates GameWindow state.
                                    that.updateLoadFrameState(func);
                                });
            }
        }
        else {
            // Update the frame location:
            iframeWindow.location.replace(uri);
        }

        // Adding a reference to nodeGame also in the iframe.
        iframeWindow.node = node;
    };

    /**
     * ### GameWindow.processUri
     *
     * Parses a uri string and adds channel uri and prefix, if defined
     *
     * @param {string} uri The uri to process
     *
     * @see GameWindow.uriPrefix
     * @see GameWindow.uriChannel
     */
    GameWindow.prototype.processUri = function(uri) {
        if (uri.charAt(0) !== '/' && uri.substr(0,7) !== 'http://') {
            if (this.uriPrefix) uri = this.uriPrefix + uri;
            if (this.uriChannel) uri = this.uriChannel + uri;
        }
        return uri;
    };

    /**
     * ### GameWindow.updateLoadFrameState
     *
     * Sets window state after a new frame has been loaded
     *
     * The method performs the following operations:
     *
     * - executes a given callback function
     * - decrements the counter of loading iframes
     * - set the window state as loaded (eventually)
     *
     * @param {function} func Optional. A callback function
     *
     * @see updateAreLoading
     *
     * @emit FRAME_LOADED
     * @emit LOADED
     */
    GameWindow.prototype.updateLoadFrameState = function(func) {
        var loaded, stageLevel;
        loaded = updateAreLoading(this, -1);
        if (loaded) this.setStateLevel('LOADED');
        if (func) func.call(node.game);

        // ng event emitter is not used.
        node.events.ee.game.emit('FRAME_LOADED');
        node.events.ee.stage.emit('FRAME_LOADED');
        node.events.ee.step.emit('FRAME_LOADED');

        if (loaded) {
            stageLevel = node.game.getStageLevel();
            if (stageLevel === CB_EXECUTED) node.emit('LOADED');
        }
        else {
            node.silly('game-window: ' + this.areLoading + ' frames ' +
                       'still loading.');
        }
    };

    /**
     * ### GameWindow.clearPageBody
     *
     * Removes all HTML from body, and resets GameWindow
     *
     * @see GameWindow.reset
     */
    GameWindow.prototype.clearPageBody = function() {
        this.reset();
        document.body.innerHTML = '';
    };

    /**
     * ### GameWindow.clearPage
     *
     * Removes all HTML from page and resets GameWindow
     *
     * @see GameWindow.reset
     */
    GameWindow.prototype.clearPage = function() {
        this.reset();
        try {
            document.documentElement.innerHTML = '';
        }
        catch(e) {
            this.removeChildrenFromNode(document.documentElement);
        }
    };

    /**
     * ### GameWindow.setUriPrefix
     *
     * Sets the variable uriPrefix
     *
     * @see GameWindow.uriPrefix
     */
    GameWindow.prototype.setUriPrefix = function(uriPrefix) {
        if (uriPrefix !== null && 'string' !== typeof uriPrefix) {
            throw new TypeError('GameWindow.setUriPrefix: uriPrefix must be ' +
                                'string or null.');
        }
        this.conf.uriPrefix = this.uriPrefix = uriPrefix;
    };

    /**
     * ### GameWindow.setUriChannel
     *
     * Sets the variable uriChannel
     *
     * @see GameWindow.uriChannel
     */
    GameWindow.prototype.setUriChannel = function(uriChannel) {
        if (uriChannel !== null && 'string' !== typeof uriChannel) {
            throw new TypeError('GameWindow.uriChannel: uriChannel must be ' +
                                'string or null.');
        }
        this.uriChannel = uriChannel;
    };

    // ## Helper functions

    /**
     * ### handleFrameLoad
     *
     * Handles iframe contents loading
     *
     * A helper method of GameWindow.loadFrame.
     * Puts cached contents into the iframe or caches new contents if requested.
     * Handles reloading of script tags and injected libraries.
     * Must be called with the current GameWindow instance.
     * Updates the references to _frameWindow_ and _frameDocument_ if the
     * iframe name is equal to _frameName_.
     *
     * @param {GameWindow} that The GameWindow instance
     * @param {uri} uri URI to load
     * @param {iframe} iframe The target iframe
     * @param {string} frameName ID of the iframe
     * @param {bool} loadCache Whether to load from cache
     * @param {bool} storeCache Whether to store to cache
     * @param {function} func Callback
     *
     * @see GameWindow.loadFrame
     *
     * @api private
     */
    function handleFrameLoad(that, uri, iframe, frameName, loadCache,
                             storeCache, func) {

        var iframeDocumentElement;
        var afterScripts;

        // Needed for IE8.
        iframe = W.getElementById(frameName);
        iframeDocumentElement = W.getIFrameDocument(iframe).documentElement;

        if (loadCache) {
            // Load frame from cache:
            iframeDocumentElement.innerHTML = that.cache[uri].contents;
        }

        // Update references to frameWindow and frameDocument
        // if this was the frame of the game.
        if (frameName === that.frameName) {
            that.frameWindow = iframe.contentWindow;
            that.frameDocument = that.getIFrameDocument(iframe);
            // Disable right click in loaded iframe document, if necessary.
            if (that.conf.rightClickDisabled) {
                J.disableRightClick(that.frameDocument);
            }
        }

        // (Re-)Inject libraries and reload scripts:
        removeLibraries(iframe);
        afterScripts = function() {
            injectLibraries(iframe, that.globalLibs.concat(
                that.frameLibs.hasOwnProperty(uri) ? that.frameLibs[uri] : []));

            if (storeCache) {
                // Store frame in cache:
                that.cache[uri].contents = iframeDocumentElement.innerHTML;
            }

            func();
        };
        if (loadCache) {
            reloadScripts(iframe, afterScripts);
        }
        else {
            afterScripts();
        }
    }

    /**
     * ### removeLibraries
     *
     * Removes injected scripts from iframe
     *
     * Takes out all the script tags with the className "injectedlib"
     * that were inserted by injectLibraries.
     *
     * @param {HTMLIFrameElement} iframe The target iframe
     *
     * @see injectLibraries
     *
     * @api private
     */
    function removeLibraries(iframe) {
        var idx;
        var contentDocument;
        var scriptNodes, scriptNode;

        contentDocument = W.getIFrameDocument(iframe);

        // Old IEs do not have getElementsByClassName.
        scriptNodes = W.getElementsByClassName(contentDocument, 'injectedlib',
                                               'script');

        // It was. To check.
        // scriptNodes = contentDocument.getElementsByClassName('injectedlib');
        for (idx = 0; idx < scriptNodes.length; idx++) {
            scriptNode = scriptNodes[idx];
            scriptNode.parentNode.removeChild(scriptNode);
        }
    }

    /**
     * ### reloadScripts
     *
     * Reloads all script nodes in iframe
     *
     * Deletes and reinserts all the script tags, effectively reloading the
     * scripts. The placement of the tags can change, but the order is kept.
     *
     * @param {HTMLIFrameElement} iframe The target iframe
     * @param {function} func Callback
     *
     * @api private
     */
    function reloadScripts(iframe, func) {
        var contentDocument;
        var headNode;
        var tag, scriptNodes, scriptNodeIdx, scriptNode;
        var attrIdx, attr;
        var numLoading;
        var needsLoad;

        contentDocument = W.getIFrameDocument(iframe);
        headNode = W.getIFrameAnyChild(iframe);

        // Start counting loading tags at 1 instead of 0 and decrement the
        // count after the loop.
        // This way the callback cannot be called before the loop finishes.
        numLoading = 1;

        scriptNodes = contentDocument.getElementsByTagName('script');
        for (scriptNodeIdx = 0; scriptNodeIdx < scriptNodes.length;
             scriptNodeIdx++) {

            // Remove tag:
            tag = scriptNodes[scriptNodeIdx];
            tag.parentNode.removeChild(tag);

            // Reinsert tag for reloading:
            scriptNode = document.createElement('script');
            if (tag.innerHTML) scriptNode.innerHTML = tag.innerHTML;
            needsLoad = false;
            for (attrIdx = 0; attrIdx < tag.attributes.length; attrIdx++) {
                attr = tag.attributes[attrIdx];
                scriptNode.setAttribute(attr.name, attr.value);
                if (attr.name === 'src') needsLoad = true;
            }
            if (needsLoad) {
                //scriptNode.async = true;
                ++numLoading;
                scriptNode.onload = function(sn) {
                    return function() {
                        sn.onload = null;
                        --numLoading;
                        if (numLoading <= 0) func();
                    };
                }(scriptNode);
            }
            headNode.appendChild(scriptNode);
        }
        --numLoading;
        if (numLoading <= 0) func();
    }

    /**
     * ### injectLibraries
     *
     * Injects scripts into the iframe
     *
     * Inserts `<script class="injectedlib" src="...">` lines into given
     * iframe object, one for every given library.
     *
     * @param {HTMLIFrameElement} iframe The target iframe
     * @param {array} libs An array of strings giving the "src" attribute for
     *   the `<script>` lines to insert
     *
     * @api private
     */
    function injectLibraries(iframe, libs) {
        var headNode;
        var scriptNode;
        var libIdx, lib;

        headNode = W.getIFrameAnyChild(iframe);

        for (libIdx = 0; libIdx < libs.length; libIdx++) {
            lib = libs[libIdx];
            scriptNode = document.createElement('script');
            scriptNode.className = 'injectedlib';
            scriptNode.src = lib;
            headNode.appendChild(scriptNode);
        }
    }

    /**
     * ### updateAreLoading
     *
     * Updates the counter of loading frames
     *
     * @param {GameWindow} that A reference to the GameWindow instance
     * @param {number} update The number to add to the counter
     *
     * @see GameWindow.lockedUpdate
     *
     * @api private
     */
    function updateAreLoading(that, update) {
        that.areLoading = that.areLoading + update;
        return that.areLoading === 0;
    }

    /**
     * ### adaptFrame2HeaderPosition
     *
     * Sets a CSS class to the frame element depending on the header position
     *
     * The frame element must exists or an error will be thrown.
     *
     * @param {GameWindow} W The current GameWindow object
     * @param {string} oldHeaderPos Optional. The previous position of the
     *   header
     *
     * @api private
     */
    function adaptFrame2HeaderPosition(W, oldHeaderPos) {
        var position;
        if (!W.frameElement) {
            throw new Error('adaptFrame2HeaderPosition: frame not found.');
        }

        // If no header is found, simulate the 'top' position to better
        // fit the whole screen.
        position = W.headerPosition || 'top';

        // When we move from bottom to any other configuration, we need
        // to move the header before the frame.
        if (oldHeaderPos === 'bottom' && position !== 'bottom') {
            W.getFrameRoot().insertBefore(W.headerElement, W.frameElement);
        }

        W.removeClass(W.frameElement, 'ng_mainframe-header-[a-z-]*');
        switch(position) {
        case 'right':
            W.addClass(W.frameElement, 'ng_mainframe-header-vertical-r');
            break;
        case 'left':
            W.addClass(W.frameElement, 'ng_mainframe-header-vertical-l');
            break;
        case 'top':
            W.addClass(W.frameElement, 'ng_mainframe-header-horizontal');
            // There might be no header yet.
            if (W.headerElement) {
                W.getFrameRoot().insertBefore(W.headerElement, W.frameElement);
            }
            break;
        case 'bottom':
            W.addClass(W.frameElement, 'ng_mainframe-header-horizontal');
            // There might be no header yet.
            if (W.headerElement) {
                W.getFrameRoot().insertBefore(W.headerElement,
                                              W.frameElement.nextSibling);
            }
            break;
        }
    }

    //Expose GameWindow prototype to the global object.
    node.GameWindow = GameWindow;

})(
    // GameWindow works only in the browser environment. The reference
    // to the node.js module object is for testing purpose only
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof window) ? window.node : module.parent.exports.node
);

/**
 * # setup.window
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * GameWindow setup functions
 *
 * http://www.nodegame.org
 */
(function(window, node) {

    var GameWindow = node.GameWindow;
    var J = node.JSUS;

    /**
     * ### GameWindow.addDefaultSetups
     *
     * Registers setup functions for GameWindow, the frame and the header
     */
    GameWindow.prototype.addDefaultSetups = function() {

        /**
         * ### node.setup.window
         *
         * Setup handler for the node.window object
         *
         * @see node.setup
         */
        node.registerSetup('window', function(conf) {
            this.window.init(conf);
            return conf;
        });

        /**
         * ### node.setup.page
         *
         * Manipulates the HTML page
         *
         * @see node.setup
         */
        node.registerSetup('page', function(conf) {
            var tmp, body;
            if (!conf) return;

            // Clear.
            if (conf.clearBody) this.window.clearPageBody();
            if (conf.clear) this.window.clearPage();
            if ('string' === typeof conf.title) {
                conf.title = { title: conf.title };
            }
            if ('object' === typeof conf.title) {
                // TODO: add option to animate it.
                document.title = conf.title.title;
                if (conf.title.addToBody) {
                    tmp = document.createElement('h1');
                    tmp.className = 'ng-page-title';
                    tmp.innerHTML = conf.title.title;
                    body = document.body;
                    if (body.innerHTML === '') body.appendChild(tmp);
                    else body.insertBefore(tmp, body.firstChild);
                }
            }
            return conf;
        });

        /**
         * ### node.setup.frame
         *
         * Manipulates the frame object
         *
         * @see node.setup
         */
        node.registerSetup('frame', function(conf) {
            var url, cb, options;
            var frameName, force, root, rootName;
            if (!conf) return;

            // Generate.
            if (conf.generate) {
                if ('object' === typeof conf.generate) {
                    if (conf.generate.root) {
                        if ('string' !== typeof conf.generate.root) {
                            node.warn('node.setup.frame: conf.generate.root ' +
                                      'must be string or undefined.');
                            return;
                        }
                        rootName = conf.generate.root;
                        force = conf.generate.force;
                        frameName = conf.generate.name;
                    }
                }
                else {
                    node.warn('node.setup.frame: conf.generate must be ' +
                              'object or undefined.');
                    return;
                }

                root = this.window.getElementById(rootName);
                if (!root) root = this.window.getScreen();
                if (!root) {
                    node.warn('node.setup.frame: could not find valid ' +
                              'root element to generate new frame.');
                    return;
                }

                this.window.generateFrame(root, frameName, force);
            }

            // Load.
            if (conf.load) {
                if ('object' === typeof conf.load) {
                    url = conf.load.url;
                    cb = conf.load.cb;
                    options = conf.load.options;
                }
                else if ('string' === typeof conf.load) {
                    url = conf.load;
                }
                else {
                    node.warn('node.setup.frame: conf.load must be string, ' +
                              'object or undefined.');
                    return;
                }
                this.window.loadFrame(url, cb, options);
            }

            // Uri prefix.
            if ('undefined' !== typeof conf.uriPrefix) {
                this.window.setUriPrefix(conf.uriPrefix);
            }

            // Clear and destroy.
            if (conf.clear) this.window.clearFrame();
            if (conf.destroy) this.window.destroyFrame();

            return conf;
        });

        /**
         * ### node.setup.header
         *
         * Manipulates the header object
         *
         * @see node.setup
         */
        node.registerSetup('header', function(conf) {
            var frameName, force, root, rootName;
            if (!conf) return;

            // Generate.
            if (conf.generate) {
                if ('object' === typeof conf.generate) {
                    if (conf.generate.root) {
                        if ('string' !== typeof conf.generate.root) {
                            node.warn('node.setup.header: conf.generate.root ' +
                                      'must be string or undefined.');
                            return;
                        }
                        rootName = conf.generate.root;
                        force = conf.generate.force;
                        frameName = conf.generate.name;
                    }
                }
                else {
                    node.warn('node.setup.header: conf.generate must be ' +
                              'object or undefined.');
                    return;
                }

                root = this.window.getElementById(rootName);
                if (!root) root = this.window.getScreen();
                if (!root) {
                    node.warn('node.setup.frame: could not find valid ' +
                              'root element to generate new frame.');
                    return;
                }

                this.window.generateFrame(root, frameName, force);
            }

            // Position.
            if (conf.position) {
                if ('string' !== typeof conf.position) {
                    node.warn('node.setup.header: conf.position ' +
                              'must be string or undefined.');
                    return;
                }
                this.window.setHeaderPosition(conf.position);
            }

            // Clear and destroy.
            if (conf.clear) this.window.clearHeader();
            if (conf.destroy) this.window.destroyHeader();

            return conf;
        });

    };
})(
    // GameWindow works only in the browser environment. The reference
    // to the node.js module object is for testing purpose only
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof window) ? window.node : module.parent.exports.node
);

/**
 * # ui-behavior
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * GameWindow UI Behavior module
 *
 * Handles default behavior of the browser on certain DOM Events.
 *
 * http://www.nodegame.org
 */
(function(window, node) {

    "use strict";

    var GameWindow = node.GameWindow;
    var J = node.JSUS;

    /**
     * ### GameWindow.noEscape
     *
     * Binds the ESC key to a function that always returns FALSE
     *
     * This prevents socket.io to break the connection with the server.
     *
     * @param {object} windowObj Optional. The window container in which
     *   to bind the ESC key
     */
    GameWindow.prototype.noEscape = function(windowObj) {
        windowObj = windowObj || window;
        windowObj.document.onkeydown = function(e) {
            var keyCode = (window.event) ? event.keyCode : e.keyCode;
            if (keyCode === 27) {
                return false;
            }
        };
        this.conf.noEscape = true;
    };

    /**
     * ### GameWindow.restoreEscape
     *
     * Removes the the listener on the ESC key
     *
     * @param {object} windowObj Optional. The window container in which
     *   to bind the ESC key
     *
     * @see GameWindow.noEscape()
     */
    GameWindow.prototype.restoreEscape = function(windowObj) {
        windowObj = windowObj || window;
        windowObj.document.onkeydown = null;
        this.conf.noEscape = false;
    };

    /**
     * ### GameWindow.promptOnleave
     *
     * Displays a confirmation box upon closing the window or tab
     *
     * Listens on the onbeforeunload event.
     *
     * @param {object} windowObj Optional. The window container in which
     *   to bind the ESC key
     * @param {string} text Optional. A text to be displayed with the alert
     *
     * @see https://developer.mozilla.org/en/DOM/window.onbeforeunload
     */
    GameWindow.prototype.promptOnleave = function(windowObj, text) {
        windowObj = windowObj || window;
        text = 'undefined' !== typeof text ? text : this.conf.promptOnleaveText;

        windowObj.onbeforeunload = function(e) {
            e = e || window.event;
            // For IE<8 and Firefox prior to version 4
            if (e) {
                e.returnValue = text;
            }
            // For Chrome, Safari, IE8+ and Opera 12+
            return text;
        };

        this.conf.promptOnleave = true;
    };

    /**
     * ### GameWindow.restoreOnleave
     *
     * Removes the onbeforeunload event listener
     *
     * @param {object} windowObj Optional. The window container in which
     *   to bind the ESC key
     *
     * @see GameWindow.promptOnleave
     * @see https://developer.mozilla.org/en/DOM/window.onbeforeunload
     */
    GameWindow.prototype.restoreOnleave = function(windowObj) {
        windowObj = windowObj || window;
        windowObj.onbeforeunload = null;
        this.conf.promptOnleave = false;
    };

    /**
     * ### GameWindow.disableRightClick
     *
     * Disables the right click in the main page and in the iframe, if found
     *
     * @see GameWindow.enableRightClick
     * @see JSUS.disableRightClick
     */
    GameWindow.prototype.disableRightClick = function() {
        if (this.frameElement) {
            J.disableRightClick(this.getFrameDocument());
        }
        J.disableRightClick(document);
        this.conf.rightClickDisabled = true;
    };

    /**
     * ### GameWindow.enableRightClick
     *
     * Enables the right click in the main page and in the iframe, if found
     *
     * @see GameWindow.disableRightClick
     * @see JSUS.enableRightClick
     */
    GameWindow.prototype.enableRightClick = function() {
        if (this.frameElement) {
             J.enableRightClick(this.getFrameDocument());
        }
        J.enableRightClick(document);
        this.conf.rightClickDisabled = false;
    };

})(
    // GameWindow works only in the browser environment. The reference
    // to the node.js module object is for testing purpose only
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof window) ? window.node : module.parent.exports.node
);

/**
 * # lockScreen
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * Locks / Unlocks the screen
 *
 * The _screen_ represents all the user can see on screen.
 * It includes the _frame_ area, but also the _header_.
 *
 * http://www.nodegame.org
 */
(function(window, node) {

    "use strict";

    var GameWindow = node.GameWindow;
    var screenLevels = node.constants.screenLevels;

    /**
     * ### GameWindow.lockScreen
     *
     * Locks the screen by opening the waitScreen widget on top
     *
     * Requires the waitScreen widget to be loaded.
     *
     * @param {string} text Optional. The text to be shown in the locked screen
     *
     * TODO: check if this can be called in any stage.
     */
    GameWindow.prototype.lockScreen = function(text) {
        var that;
        that = this;

        if (!this.waitScreen) {
            throw new Error('GameWindow.lockScreen: waitScreen not found.');
        }
        if (text && 'string' !== typeof text) {
            throw new TypeError('GameWindow.lockScreen: text must be string ' +
                                'or undefined');
        }
        // Feb 16.02.2015
        // Commented out the time-out part. It causes the browser to get stuck
        // on a locked screen, because the method is invoked multiple times.
        // If no further problem is found out, it can be eliminated.
        // if (!this.isReady()) {
        //   setTimeout(function() { that.lockScreen(text); }, 100);
        // }
        this.setScreenLevel('LOCKING');
        text = text || 'Screen locked. Please wait...';
        this.waitScreen.lock(text);
        this.setScreenLevel('LOCKED');
    };

    /**
     * ### GameWindow.unlockScreen
     *
     * Unlocks the screen by removing the waitScreen widget on top
     *
     * Requires the waitScreen widget to be loaded.
     */
    GameWindow.prototype.unlockScreen = function() {
        if (!this.waitScreen) {
            throw new Error('GameWindow.unlockScreen: waitScreen not found.');
        }
        if (!this.isScreenLocked()) {
            throw new Error('GameWindow.unlockScreen: screen is not locked.');
        }
        this.setScreenLevel('UNLOCKING');
        this.waitScreen.unlock();
        this.setScreenLevel('ACTIVE');
    };

    /**
     * ### GameWindow.isScreenLocked
     *
     * Checks whether the screen is locked
     *
     * @return {boolean} TRUE if the screen is locked
     *
     * @see GameWindow.screenState
     */
    GameWindow.prototype.isScreenLocked = function() {
        return this.getScreenLevel() !== screenLevels.ACTIVE;
    };
})(
    // GameWindow works only in the browser environment. The reference
    // to the node.js module object is for testing purpose only
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof window) ? window.node : module.parent.exports.node
);

/**
 * # listeners
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * GameWindow listeners
 *
 * www.nodegame.org
 */
(function(node) {

    "use strict";

    var J = node.JSUS;

    function getElement(idOrObj, prefix) {
        var el;
        if ('string' === typeof idOrObj) {
            el = W.getElementById(idOrObj);
        }
        else if (J.isElement(idOrObj)) {
            el = idOrObj;
        }
        else {
            throw new TypeError(prefix + ': idOrObj must be string ' +
                                ' or HTML Element.');
        }
        return el;
    }

    var GameWindow = node.GameWindow;

    /**
     * ## GameWindow.addDefaultListeners
     *
     * Adds a battery of event listeners for incoming messages
     *
     * If executed once, it requires a force flag to re-add the listeners
     *
     * @param {boolean} force Whether to force re-adding the listeners
     * @return {boolean} TRUE on success
     */
    GameWindow.prototype.addDefaultListeners = function(force) {

        if (this.listenersAdded && !force) {
            node.err('node.window.addDefaultListeners: listeners already ' +
                     'added once. Use the force flag to re-add.');
            return false;
        }

        node.on('NODEGAME_GAME_CREATED', function() {
            W.init(node.conf.window);
        });

        node.on('HIDE', function(idOrObj) {
            var el;
            el = getElement(idOrObj, 'GameWindow.on.HIDE');
            if (el) el.style.display = 'none';
        });

        node.on('SHOW', function(idOrObj) {
            var el;
            el = getElement(idOrObj, 'GameWindow.on.SHOW');
            if (el) el.style.display = '';
        });

        node.on('TOGGLE', function(idOrObj) {
            var el;
            el = getElement(idOrObj, 'GameWindow.on.TOGGLE');
            if (el) {
                if (el.style.display === 'none') {
                    el.style.display = '';
                }
                else {
                    el.style.display = 'none';
                }
            }
        });

        // Disable all the input forms found within a given id element.
        node.on('INPUT_DISABLE', function(id) {
            W.toggleInputs(id, true);
        });

        // Disable all the input forms found within a given id element.
        node.on('INPUT_ENABLE', function(id) {
            W.toggleInputs(id, false);
        });

        // Disable all the input forms found within a given id element.
        node.on('INPUT_TOGGLE', function(id) {
            W.toggleInputs(id);
        });

        /**
         * Force disconnection upon page unload
         *
         * This makes browsers using AJAX to signal disconnection immediately.
         *
         * Kudos:
         * http://stackoverflow.com/questions/1704533/intercept-page-exit-event
         */
        window.onunload = function() {
            var i;
            node.socket.disconnect();
            // Do nothing, but gain time.
            for (i = -1 ; ++i < 100000 ; ) { }
        };

        // Mark listeners as added.
        this.listenersAdded = true;

        node.silly('node-window: listeners added.');
        return true;
    };

})(
    'undefined' !== typeof node ? node : undefined
);

/**
 * # WaitScreen
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * Covers the screen with a gray layer, disables inputs, and displays a message
 *
 * www.nodegame.org
 */
(function(exports, window) {

    "use strict";

    // Append under window.node.
    exports.WaitScreen = WaitScreen;

    // ## Meta-data

    WaitScreen.version = '0.7.0';
    WaitScreen.description = 'Show a standard waiting screen';

    // ## Helper functions

    var inputTags, len;
    inputTags = ['button', 'select', 'textarea', 'input'];
    len = inputTags.length;

    /**
     * ### lockUnlockedInputs
     *
     * Scans a container HTML Element for active input tags and disables them
     *
     * Stores a references into W.waitScreen.lockedInputs so that they can
     * be re-activated later.
     *
     * @param {Document|Element} container The target to scan for input tags
     * @param {boolean} disable Optional. Lock inputs if TRUE, unlock if FALSE.
     *   Default: TRUE
     *
     * @api private
     */
    function lockUnlockedInputs(container, disable) {
        var j, i, inputs, nInputs;

        if ('undefined' === typeof disable) disable = true;

        for (j = -1; ++j < len; ) {
            inputs = container.getElementsByTagName(inputTags[j]);
            nInputs = inputs.length;
            for (i = -1 ; ++i < nInputs ; ) {
                if (disable) {
                    if (!inputs[i].disabled) {
                        inputs[i].disabled = true;
                        W.waitScreen.lockedInputs.push(inputs[i]);
                    }
                }
                else {
                    if (inputs[i].disabled) {
                        inputs[i].disabled = false;
                    }
                }
            }
        }

        if (!disable) W.waitScreen.lockedInputs = [];
    }

    function event_REALLY_DONE(text) {
        text = text || W.waitScreen.defaultTexts.waiting;
        if (!node.game.shouldStep()) {
            if (W.isScreenLocked()) {
                W.waitScreen.updateText(text);
            }
            else {
                W.lockScreen(text);
            }
        }
    }

    function event_STEPPING(text) {
        text = text || W.waitScreen.defaultTexts.stepping;
        if (W.isScreenLocked()) {
            W.waitScreen.updateText(text);
        }
        else {
            W.lockScreen(text);
        }
    }

    function event_PLAYING() {
        if (W.isScreenLocked()) {
            W.unlockScreen();
        }
    }

    function event_PAUSED(text) {
        text = text || W.waitScreen.defaultTexts.paused;
        if (W.isScreenLocked()) {
            W.waitScreen.beforePauseInnerHTML =
                W.waitScreen.waitingDiv.innerHTML;
            W.waitScreen.updateText(text);
        }
        else {
            W.lockScreen(text);
        }
    }

    function event_RESUMED() {
        if (W.isScreenLocked()) {
            if (W.waitScreen.beforePauseInnerHTML !== null) {
                W.waitScreen.updateText(W.waitScreen.beforePauseInnerHTML);
                W.waitScreen.beforePauseInnerHTML = null;
            }
            else {
                W.unlockScreen();
            }
        }
    }

    /**
     * ## WaitScreen constructor
     *
     * Instantiates a new WaitScreen object
     *
     * @param {object} options Optional. Configuration options
     */
    function WaitScreen(options) {
        options = options || {};

        /**
         * ### WaitScreen.id
         *
         * The id of _waitingDiv_. Default: 'ng_waitScreen'
         *
         * @see WaitScreen.waitingDiv
         */
        this.id = options.id || 'ng_waitScreen';

        /**
         * ### WaitScreen.root
         *
         * Reference to the root element under which _waitingDiv is appended
         *
         * @see WaitScreen.waitingDiv
         */
        this.root = options.root || null;

        /**
         * ### WaitScreen.waitingDiv
         *
         * Reference to the HTML Element that actually locks the screen
         */
        this.waitingDiv = null;

        /**
         * ### WaitScreen.beforePauseText
         *
         * Flag if the screen should stay locked after a RESUMED event
         *
         * Contains the value of the innerHTML attribute of the waiting div.
         */
        this.beforePauseInnerHTML = null;

        /**
         * ### WaitScreen.enabled
         *
         * Flag is TRUE if the listeners are registered
         *
         * @see WaitScreen.enable
         */
        this.enabled = false;

        /**
         * ### WaitScreen.text
         *
         * Default texts for default events
         */
        this.defaultTexts = {
            waiting: options.waitingText ||
                'Waiting for other players to be done...',
            stepping: options.steppingText ||
                'Initializing game step, will be ready soon...',
            paused: options.pausedText ||
                'Game is paused. Please wait.'
        };

        /**
         * ## WaitScreen.lockedInputs
         *
         * List of locked inputs by the _lock_ method
         *
         * @see WaitScreen.lock
         */
        this.lockedInputs = [];

        // Registers the event listeners.
        this.enable();
    }

    /**
     * ### WaitScreen.enable
     *
     * Registers default event listeners
     */
    WaitScreen.prototype.enable = function() {
        if (this.enabled) return;
        node.events.ee.game.on('REALLY_DONE', event_REALLY_DONE);
        node.events.ee.game.on('STEPPING', event_STEPPING);
        node.events.ee.game.on('PLAYING', event_PLAYING);
        node.events.ee.game.on('PAUSED', event_PAUSED);
        node.events.ee.game.on('RESUMED', event_RESUMED);
        this.enabled = true;
    };

    /**
     * ### WaitScreen.disable
     *
     * Unregisters default event listeners
     */
    WaitScreen.prototype.disable = function() {
        if (!this.enabled) return;
        node.events.ee.game.off('REALLY_DONE', event_REALLY_DONE);
        node.events.ee.game.off('STEPPING', event_STEPPING);
        node.events.ee.game.off('PLAYING', event_PLAYING);
        node.events.ee.game.off('PAUSED', event_PAUSED);
        node.events.ee.game.off('RESUMED', event_RESUMED);
        this.enabled = false;
    };

    /**
     * ### WaitScreen.lock
     *
     * Locks the screen
     *
     * Overlays a gray div on top of the page and disables all inputs.
     *
     * If called on an already locked screen, the previous text is destroyed.
     * Use `WaitScreen.updateText` to modify an existing text.
     *
     * @param {string} text Optional. If set, displays the text on top of the
     *   gray string
     *
     * @see WaitScreen.unlock
     * @see WaitScren.updateText
     */
    WaitScreen.prototype.lock = function(text) {
        var frameDoc;
        if ('undefined' === typeof document.getElementsByTagName) {
            node.warn('WaitScreen.lock: cannot lock inputs.');
        }
        // Disables all input forms in the page.
        lockUnlockedInputs(document);

        //frameDoc = W.getFrameDocument();
        // Using this for IE8 compatibility.
        frameDoc = W.getIFrameDocument(W.getFrame());

        if (frameDoc) lockUnlockedInputs(frameDoc);

        if (!this.waitingDiv) {
            if (!this.root) {
                this.root = W.getFrameRoot() || document.body;
            }
            this.waitingDiv = W.addDiv(this.root, this.id);
        }
        if (this.waitingDiv.style.display === 'none') {
            this.waitingDiv.style.display = '';
        }
        this.waitingDiv.innerHTML = text;
    };

    /**
     * ### WaitScreen.unlock
     *
     * Removes the overlayed gray div and re-enables the inputs on the page
     *
     * @see WaitScreen.lock
     */
    WaitScreen.prototype.unlock = function() {
        var i, len;

        if (this.waitingDiv) {
            if (this.waitingDiv.style.display === '') {
                this.waitingDiv.style.display = 'none';
            }
        }
        // Re-enables all previously locked input forms in the page.
        try {
            len = this.lockedInputs.length;
            for (i = -1 ; ++i < len ; ) {
                this.lockedInputs[i].removeAttribute('disabled');
            }
            this.lockedInputs = [];
        }
        catch(e) {
            // For IE8.
            lockUnlockedInputs(W.getIFrameDocument(W.getFrame()), false);
        }
    };

    /**
     * ### WaitScreen.updateText
     *
     * Updates the text displayed on the current waiting div
     *
     * @param {string} text The text to be displayed
     * @param {boolean} append Optional. If TRUE, the text is appended. By
     *   default the old text is replaced
     */
    WaitScreen.prototype.updateText = function(text, append) {
        append = append || false;
        if ('string' !== typeof text) {
            throw new TypeError('WaitScreen.updateText: text must be string.');
        }
        if (append) {
            this.waitingDiv.appendChild(document.createTextNode(text));
        }
        else {
            this.waitingDiv.innerHTML = text;
        }
    };

    /**
     * ### WaitScreen.destroy
     *
     * Removes the waiting div from the HTML page and unlocks the screen
     *
     * @see WaitScreen.unlock
     */
    WaitScreen.prototype.destroy = function() {
        if (W.isScreenLocked()) {
            W.setScreenLevel('UNLOCKING');
            this.unlock();
            W.setScreenLevel('ACTIVE');
        }
        if (this.waitingDiv) {
            this.waitingDiv.parentNode.removeChild(this.waitingDiv);
        }
        // Removes previously registered listeners.
        this.disable();
    };

})(
    ('undefined' !== typeof node) ? node : module.parent.exports.node,
    ('undefined' !== typeof window) ? window : module.parent.exports.window
);

/**
 * # selector
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * Utility functions to create and manipulate meaninful HTML select lists for
 * nodeGame
 *
 * http://www.nodegame.org
 */
(function(window, node) {

    "use strict";

    var J = node.JSUS;
    var constants = node.constants;
    var GameWindow = node.GameWindow;

    /**
     * ### GameWindow.getRecipientSelector
     *
     * Creates an HTML select element populated with the data of other players
     *
     * @param {string} id Optional. The id of the element
     *
     * @return The newly created select element
     *
     * @see GameWindow.addRecipientSelector
     * @see GameWindow.addStandardRecipients
     * @see GameWindow.populateRecipientSelector
     *
     * TODO: add options to control which players/servers to add.
     */
    GameWindow.prototype.getRecipientSelector = function(id) {
        var toSelector;

        toSelector = document.createElement('select');
        if ('undefined' !== typeof id) {
            toSelector.id = id;
        }
        this.addStandardRecipients(toSelector);
        return toSelector;
    };

    /**
     * ### GameWindow.addRecipientSelector
     *
     * Appends a RecipientSelector element to the specified root element
     *
     * @param {Element} root The root element
     * @param {string} id The id of the selector
     *
     * @return {boolean} FALSE if no valid root element is found, TRUE otherwise
     *
     * @see GameWindow.addRecipientSelector
     * @see GameWindow.addStandardRecipients
     * @see GameWindow.populateRecipientSelector
     *
     * TODO: adds options to control which players/servers to add.
     */
    GameWindow.prototype.addRecipientSelector = function(root, id) {
        var toSelector;

        if (!root) return false;
        toSelector = this.getRecipientSelector(id);
        return root.appendChild(toSelector);
    };

    /**
     * ### GameWindow.addStandardRecipients
     *
     * Adds valid _to_ recipient options to a specified select element
     *
     * @param {object} toSelector An HTML `<select>` element
     *
     * @see GameWindow.populateRecipientSelector
     *
     * TODO: adds options to control which players/servers to add.
     */
    GameWindow.prototype.addStandardRecipients = function(toSelector) {
        var opt;

        opt = document.createElement('option');
        opt.value = 'ALL';
        opt.appendChild(document.createTextNode('ALL'));
        toSelector.appendChild(opt);

        opt = document.createElement('option');
        opt.value = 'CHANNEL';
        opt.appendChild(document.createTextNode('CHANNEL'));
        toSelector.appendChild(opt);

        opt = document.createElement('option');
        opt.value = 'ROOM';
        opt.appendChild(document.createTextNode('ROOM'));
        toSelector.appendChild(opt);

        opt = document.createElement('option');
        opt.value = 'SERVER';
        opt.appendChild(document.createTextNode('SERVER'));
        toSelector.appendChild(opt);
    };

    /**
     * ### GameWindow.populateRecipientSelector
     *
     * Adds all the players from a specified playerList object to a given
     * select element
     *
     * @param {object} toSelector An HTML `<select>` element
     * @param {PlayerList} playerList The PlayerList object
     *
     * @see GameWindow.addStandardRecipients
     */
    GameWindow.prototype.populateRecipientSelector =
    function(toSelector, playerList) {
        var players, opt;

        if ('object' !== typeof playerList || 'object' !== typeof toSelector) {
            return;
        }

        this.removeChildrenFromNode(toSelector);
        this.addStandardRecipients(toSelector);

        // check if it is a DB or a PlayerList object
        players = playerList.db || playerList;

        J.each(players, function(p) {
            opt = document.createElement('option');
            opt.value = p.id;
            opt.appendChild(document.createTextNode(p.name || p.id));
            toSelector.appendChild(opt);
        });
    };

    /**
     * ### GameWindow.getActionSelector
     *
     * Creates an HTML select element with all the predefined actions
     * (SET,GET,SAY,SHOW*) as options
     *
     * @param {string} id The id of the selector
     *
     * @return {Element} The newly created selector
     *
     * @see GameWindow.addActionSelector
     */
    GameWindow.prototype.getActionSelector = function(id) {
        var actionSelector = document.createElement('select');
        if ('undefined' !== typeof id) {
            actionSelector.id = id;
        }
        this.populateSelect(actionSelector, constants.action);
        return actionSelector;
    };

    /**
     * ### GameWindow.addActionSelector
     *
     * Appends an ActionSelector element to the specified root element
     *
     * @param {Element} root The root element
     * @param {string} id The id of the selector
     *
     * @return {Element} The newly created selector
     *
     * @see GameWindow.getActionSelector
     */
    GameWindow.prototype.addActionSelector = function(root, id) {
        var actionSelector;

        if (!root) return;
        actionSelector = this.getActionSelector(id);
        return root.appendChild(actionSelector);
    };

    /**
     * ### GameWindow.getTargetSelector
     *
     * Creates an HTML select element with all the predefined targets
     * (HI,TXT,DATA, etc.) as options
     *
     * @param {string} id The id of the selector
     *
     * @return {Element} The newly created selector
     *
     * @see GameWindow.addActionSelector
     */
    GameWindow.prototype.getTargetSelector = function(id) {
        var targetSelector;

        targetSelector = document.createElement('select');
        if ('undefined' !== typeof id ) {
            targetSelector.id = id;
        }
        this.populateSelect(targetSelector, constants.target);
        return targetSelector;
    };

    /**
     * ### GameWindow.addTargetSelector
     *
     * Appends a target selector element to the specified root element
     *
     * @param {Element} root The root element
     * @param {string} id The id of the selector
     *
     * @return {Element} The newly created selector
     *
     * @see GameWindow.getTargetSelector
     */
    GameWindow.prototype.addTargetSelector = function(root, id) {
        if (!root) return;
        var targetSelector = this.getTargetSelector(id);
        return root.appendChild(targetSelector);
    };
})(
    // GameWindow works only in the browser environment. The reference
    // to the node.js module object is for testing purpose only
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof window) ? window.node : module.parent.exports.node
);

/**
 * # extra
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * GameWindow extras
 *
 * http://www.nodegame.org
 */
(function(window, node) {

    "use strict";

    var GameWindow = node.GameWindow;
    var J = node.JSUS;
    var DOM = J.get('DOM');

    /**
     * ### GameWindow.getScreen
     *
     * Returns the screen of the game, i.e. the innermost element
     * inside which to display content
     *
     * In the following order the screen can be:
     *
     * - the body element of the iframe
     * - the document element of the iframe
     * - the body element of the document
     * - the last child element of the document
     *
     * @return {Element} The screen
     */
    GameWindow.prototype.getScreen = function() {
        var el = this.getFrameDocument();
        if (el) {
            el = el.body || el;
        }
        else {
            el = document.body || document.lastElementChild;
        }
        return el;
    };

    /**
     * ### GameWindow.write
     *
     * Appends content inside a root element
     *
     * The content can be a text string, an HTML node or element.
     * If no root element is specified, the default screen is used.
     *
     * @param {string|object} text The content to write
     * @param {Element|string} root Optional. The root element or its id
     *
     * @return {string|object} The content written
     *
     * @see GameWindow.writeln
     */
    GameWindow.prototype.write = function(text, root) {
        if ('string' === typeof root) {
            root = this.getElementById(root);
        }
        else if (!root) {
            root = this.getScreen();
        }
        if (!root) {
            throw new
                Error('GameWindow.write: could not determine where to write.');
        }
        return DOM.write(root, text);
    };

    /**
     * ### GameWindow.writeln
     *
     * Appends content inside a root element followed by a break element
     *
     * The content can be a text string, an HTML node or element.
     * If no root element is specified, the default screen is used.
     *
     * @param {string|object} text The content to write
     * @param {Element|string} root Optional. The root element or its id
     *
     * @return {string|object} The content written
     *
     * @see GameWindow.write
     */
    GameWindow.prototype.writeln = function(text, root, br) {
        if ('string' === typeof root) {
            root = this.getElementById(root);
        }
        else if (!root) {
            root = this.getScreen();
        }
        if (!root) {
            throw new Error('GameWindow.writeln: ' +
                            'could not determine where to write.');
        }
        return DOM.writeln(root, text, br);
    };

    /**
     * ### GameWindow.generateUniqueId
     *
     * Generates a unique id
     *
     * Overrides JSUS.DOM.generateUniqueId.
     *
     * @param {string} prefix Optional. The prefix to use
     *
     * @return {string} The generated id
     *
     * @experimental
     * TODO: it is not always working fine.
     */
    GameWindow.prototype.generateUniqueId = function(prefix) {
        var id, found;

        id = '' + (prefix || J.randomInt(0, 1000));
        found = this.getElementById(id);

        while (found) {
            id = '' + prefix + '_' + J.randomInt(0, 1000);
            found = this.getElementById(id);
        }
        return id;
    };

    /**
     * ### GameWindow.toggleInputs
     *
     * Enables / disables the input forms
     *
     * If an id is provided, only input elements that are children
     * of the element with the specified id are toggled.
     *
     * If id is not given, it toggles the input elements on the whole page,
     * including the frame document, if found.
     *
     * If a state parameter is given, all the input forms will be either
     * disabled or enabled (and not toggled).
     *
     * @param {string} id Optional. The id of the element container
     *   of the forms. Default: the whole page, including the frame document
     * @param {boolean} disabled Optional. Forces all the inputs to be either
     *   disabled or enabled (not toggled)
     *
     * @return {boolean} FALSE, if the method could not be executed
     *
     * @see GameWindow.getFrameDocument
     * @see toggleInputs
     */
    GameWindow.prototype.toggleInputs = function(id, disabled) {
        var container;
        if (!document.getElementsByTagName) {
            node.err(
                'GameWindow.toggleInputs: getElementsByTagName not found.');
            return false;
        }
        if (id && 'string' === typeof id) {
            throw new Error('GameWindow.toggleInputs: id must be string or ' +
                            'undefined.');
        }
        if (id) {
            container = this.getElementById(id);
            if (!container) {
                throw new Error('GameWindow.toggleInputs: no elements found ' +
                                'with id ' + id + '.');
            }
            toggleInputs(disabled, container);
        }
        else {
            // The whole page.
            toggleInputs(disabled);
            // If there is Frame apply it there too.
            container = this.getFrameDocument();
            if (container) {
                toggleInputs(disabled, container);
            }
        }
        return true;
    };

    /**
     * ### GameWindow.getScreenInfo
     *
     * Returns information about the screen in which nodeGame is running
     *
     * @return {object} A object containing the scren info
     */
    GameWindow.prototype.getScreenInfo = function() {
        var screen = window.screen;
        return {
            height: screen.height,
            widht: screen.width,
            availHeight: screen.availHeight,
            availWidth: screen.availWidht,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixedDepth
        };
    };

    /**
     * ### GameWindow.getLoadingDots
     *
     * Creates and returns a span element with incrementing dots inside
     *
     * New dots are added every second until the limit is reached, then it
     * starts from the beginning.
     *
     * Gives the impression of a loading time.
     *
     * @param {number} len Optional. The maximum length of the loading dots.
     *   Default: 5
     * @param {string} id Optional The id of the span
     *
     * @return {object} An object containing two properties: the span element
     *   and a method stop, that clears the interval
     */
    GameWindow.prototype.getLoadingDots = function(len, id) {
        var span_dots, i, limit, intervalId;
        if (len & len < 0) {
            throw new Error('GameWindow.getLoadingDots: len < 0.');
        }
        len = len || 5;
        span_dots = document.createElement('span');
        span_dots.id = id || 'span_dots';
        limit = '';
        for (i = 0; i < len; i++) {
            limit = limit + '.';
        }
        // Refreshing the dots...
        intervalId = setInterval(function() {
            if (span_dots.innerHTML !== limit) {
                span_dots.innerHTML = span_dots.innerHTML + '.';
            }
            else {
                span_dots.innerHTML = '.';
            }
        }, 1000);

        function stop() {
            span_dots.innerHTML = '.';
            clearInterval(intervalId);
        }

        return {
            span: span_dots,
            stop: stop
        };
    };

    /**
     * ### GameWindow.addLoadingDots
     *
     * Appends _loading dots_ to an HTML element
     *
     * By invoking this method you lose access to the _stop_ function of the
     * _loading dots_ element.
     *
     * @param {HTMLElement} root The element to which the loading dots will be
     *   appended
     * @param {number} len Optional. The maximum length of the loading dots.
     *   Default: 5
     * @param {string} id Optional The id of the span
     *
     * @return {object} The span with the loading dots
     *
     * @see GameWindow.getLoadingDots
     */
    GameWindow.prototype.addLoadingDots = function(root, len, id) {
        return root.appendChild(this.getLoadingDots(len, id).span);
    };

     /**
     * ### GameWindow.getEventButton
     *
     * Creates an HTML button element that will emit an event when clicked
     *
     * @param {string} event The event to emit when clicked
     * @param {string} text Optional. The text on the button
     * @param {string} id The id of the button
     * @param {object} attributes Optional. The attributes of the button
     *
     * @return {Element} The newly created button
     */
    GameWindow.prototype.getEventButton =
    function(event, text, id, attributes) {

        var b;
        if ('string' !== typeof event) {
            throw new TypeError('GameWindow.getEventButton: event must ' +
                                'be string.');
        }
        b = this.getButton(id, text, attributes);
        b.onclick = function() {
            node.emit(event);
        };
        return b;
    };

    /**
     * ### GameWindow.addEventButton
     *
     * Adds an EventButton to the specified root element
     *
     * If no valid root element is provided, it is append as last element
     * in the current screen.
     *
     * @param {string} event The event to emit when clicked
     * @param {string} text Optional. The text on the button
     * @param {Element} root Optional. The root element
     * @param {string} id The id of the button
     * @param {object} attributes Optional. The attributes of the button
     *
     * @return {Element} The newly created button
     *
     * @see GameWindow.getEventButton
     */
    GameWindow.prototype.addEventButton =
    function(event, text, root, id, attributes) {
        var eb;

        if (!event) return;
        if (!root) {
            root = this.getScreen();
        }

        eb = this.getEventButton(event, text, id, attributes);

        return root.appendChild(eb);
    };

    // ## Helper Functions

    /**
     * ### toggleInputs
     *
     * @api private
     */
    function toggleInputs(state, container) {
        var inputTags, j, len, i, inputs, nInputs;
        container = container || document;
        inputTags = ['button', 'select', 'textarea', 'input'];
        len = inputTags.length;
        for (j = 0; j < len; j++) {
            inputs = container.getElementsByTagName(inputTags[j]);
            nInputs = inputs.length;
            for (i = 0; i < nInputs; i++) {
                // Set to state, or toggle.
                if ('undefined' === typeof state) {
                    state = inputs[i].disabled ? false : true;
                }
                if (state) {
                    inputs[i].disabled = state;
                }
                else {
                    inputs[i].removeAttribute('disabled');
                }
            }
        }
    }

})(
    // GameWindow works only in the browser environment. The reference
    // to the node.js module object is for testing purpose only
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof window) ? window.node : module.parent.exports.node
);

// Creates a new GameWindow instance in the global scope.
(function() {
    "use strict";
    node.window = new node.GameWindow();
    if ('undefined' !== typeof window) window.W = node.window;
})();

/**
 * # Canvas
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * Creates an HTML canvas that can be manipulated by an api
 *
 * www.nodegame.org
 */
(function(exports) {

    "use strict";

    exports.Canvas = Canvas;

    function Canvas(canvas) {

        this.canvas = canvas;
        // 2D Canvas Context
        this.ctx = canvas.getContext('2d');

        this.centerX = canvas.width / 2;
        this.centerY = canvas.height / 2;

        this.width = canvas.width;
        this.height = canvas.height;
    }

    Canvas.prototype = {

        constructor: Canvas,

        drawOval: function (settings) {

            // We keep the center fixed
            var x = settings.x / settings.scale_x;
            var y = settings.y / settings.scale_y;

            var radius = settings.radius || 100;
            //console.log(settings);
            //console.log('X,Y(' + x + ', ' + y + '); Radius: ' + radius +
            //    ', Scale: ' + settings.scale_x + ',' + settings.scale_y);

            this.ctx.lineWidth = settings.lineWidth || 1;
            this.ctx.strokeStyle = settings.color || '#000000';

            this.ctx.save();
            this.ctx.scale(settings.scale_x, settings.scale_y);
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI*2, false);
            this.ctx.stroke();
            this.ctx.closePath();
            this.ctx.restore();
        },

        drawLine: function (settings) {

            var from_x = settings.x;
            var from_y = settings.y;

            var length = settings.length;
            var angle = settings.angle;

            // Rotation
            var to_x = - Math.cos(angle) * length + settings.x;
            var to_y =  Math.sin(angle) * length + settings.y;
            //console.log('aa ' + to_x + ' ' + to_y);

            //console.log('From (' + from_x + ', ' + from_y + ') To (' + to_x +
            //            ', ' + to_y + ')');
            //console.log('Length: ' + length + ', Angle: ' + angle );

            this.ctx.lineWidth = settings.lineWidth || 1;
            this.ctx.strokeStyle = settings.color || '#000000';

            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.moveTo(from_x,from_y);
            this.ctx.lineTo(to_x,to_y);
            this.ctx.stroke();
            this.ctx.closePath();
            this.ctx.restore();
        },

        scale: function (x,y) {
            this.ctx.scale(x,y);
            this.centerX = this.canvas.width / 2 / x;
            this.centerY = this.canvas.height / 2 / y;
        },

        clear: function() {
            this.ctx.clearRect(0, 0, this.width, this.height);
            // For IE
            var w = this.canvas.width;
            this.canvas.width = 1;
            this.canvas.width = w;
        }
    };

})(node.window);

/**
 * # HTMLRenderer
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * Renders javascript objects into HTML following a pipeline
 * of decorator functions
 *
 * The default pipeline always looks for a `content` property and
 * performs the following operations:
 *
 * - if it is already an HTML element, returns it;
 * - if it contains a  #parse() method, tries to invoke it to generate HTML;
 * - if it is an object, tries to render it as a table of key:value pairs;
 * - finally, creates an HTML text node with it and returns it
 *
 * Depends on the nodegame-client add-on TriggerManager
 *
 * www.nodegame.org
 */
(function(exports, window, node) {

    "use strict";

    // ## Global scope

    var document = window.document,
    JSUS = node.JSUS;

    var TriggerManager = node.TriggerManager;

    if (!TriggerManager) {
        throw new Error('HTMLRenderer requires node.TriggerManager to load.');
    }

    exports.HTMLRenderer = HTMLRenderer;
    exports.HTMLRenderer.Entity = Entity;

    /**
     * ## HTMLRenderer constructor
     *
     * Creates a new instance of HTMLRenderer
     *
     * @param {object} options A configuration object
     */
    function HTMLRenderer (options) {
        // ### HTMLRenderer.options
        this.options = options || {};

        // ### HTMLRenderer.tm
        // TriggerManager instance
        this.tm = new TriggerManager();

        this.init(this.options);
    }

    // ## HTMLRenderer methods

    /**
     * ### HTMLRenderer.init
     *
     * Configures the HTMLRenderer instance
     *
     * Takes the configuration as an input parameter or
     * recycles the settings in `this.options`.
     *
     * The configuration object is of the type
     *
     * ```
     * var options = {
     *     returnAt: 'first',  // or 'last'
     *     render: [ myFunc, myFunc2 ]
     * }
     * ```
     *
     * @param {object} options Optional. Configuration object
     */
    HTMLRenderer.prototype.init = function(options) {
        options = options || this.options;
        this.options = options;

        this.reset();

        if (options.returnAt) {
            this.tm.returnAt = options.returnAt;
        }

        if (options.pipeline) {
            this.tm.initTriggers(options.pipeline);
        }
    };



    /**
     * ### HTMLRenderer.reset
     *
     * Deletes all registered render function and restores the default
     * pipeline
     */
    HTMLRenderer.prototype.reset = function() {
        this.clear(true);
        this.addDefaultPipeline();
    };

    /**
     * ### HTMLRenderer.addDefaultPipeline
     *
     * Registers the set of default render functions
     */
    HTMLRenderer.prototype.addDefaultPipeline = function() {
        this.tm.addTrigger(function(el){
            return document.createTextNode(el.content);
        });

        this.tm.addTrigger(function(el) {
            if (!el) return;
            if (el.content && 'object' === typeof el.content) {
                var div = document.createElement('div');
                for (var key in el.content) {
                    if (el.content.hasOwnProperty(key)) {
                        var str = key + ':\t' + el.content[key];
                        div.appendChild(document.createTextNode(str));
                        div.appendChild(document.createElement('br'));
                    }
                }
                return div;
            }
        });

        this.tm.addTrigger(function(el) {
            var html;
            if (!el) return;
            if (el.content && el.content.parse &&
                'function' === typeof el.content.parse) {

                html = el.content.parse();
                if (JSUS.isElement(html) || JSUS.isNode(html)) {
                    return html;
                }
            }
        });

        this.tm.addTrigger(function(el) {
            if (!el) return;
            if (JSUS.isElement(el.content) || JSUS.isNode(el.content)) {
                return el.content;
            }
        });
    };


    /**
     * ### HTMLRenderer.clear
     *
     * Deletes all registered render functions
     *
     * @param {boolean} clear Whether to confirm the clearing
     *
     * @return {boolean} TRUE, if clearing is successful
     */
    HTMLRenderer.prototype.clear = function(clear) {
        return this.tm.clear(clear);
    };

    /**
     * ### HTMLRenderer.addRenderer
     *
     * Registers a new render function
     *
     * @param {function} renderer The function to add
     * @param {number} pos Optional. The position of the renderer in the
     *   pipeline
     *
     * @return {boolean} TRUE, if insertion is successful
     */
    HTMLRenderer.prototype.addRenderer = function(renderer, pos) {
        return this.tm.addTrigger(renderer, pos);
    };

    /**
     * ### HTMLRenderer.removeRenderer
     *
     * Removes a render function from the pipeline
     *
     * @param {function} renderer The function to remove
     *
     * @return {boolean} TRUE, if removal is successful
     */
    HTMLRenderer.prototype.removeRenderer = function(renderer) {
        return this.tm.removeTrigger(renderer);
    };

    /**
     * ### HTMLRenderer.render
     *
     * Runs the pipeline of render functions on a target object
     *
     * @param {object} o The target object
     *
     * @return {object} The target object after exiting the pipeline
     *
     * @see TriggerManager.pullTriggers
     */
    HTMLRenderer.prototype.render = function(o) {
        return this.tm.pullTriggers(o);
    };

    /**
     * ### HTMLRenderer.size
     *
     * Counts the number of render functions in the pipeline
     *
     * @return {number} The number of render functions in the pipeline
     */
    HTMLRenderer.prototype.size = function() {
        return this.tm.triggers.length;
    };

    /**
     * # Entity
     *
     * Abstract representation of an HTML entity
     */

    /**
     * ## Entity constructor
     *
     * Creates a new instace of Entity
     *
     * @param {object} e The object to transform in entity
     */
    function Entity(e) {
        e = e || {};
        this.content = ('undefined' !== typeof e.content) ? e.content : '';
        this.className = ('undefined' !== typeof e.style) ? e.style : null;
    }

})(
    ('undefined' !== typeof node) ? node.window || node : module.exports,
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof node) ? node : module.parent.exports.node
);

/**
 * # List
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * Creates an HTML list that can be manipulated by an api
 *
 * www.nodegame.org
 */
(function(exports, node) {

    "use strict";

    var NDDB = node.NDDB;

    var HTMLRenderer = node.window.HTMLRenderer;
    var Entity = node.window.HTMLRenderer.Entity;

    exports.List = List;

    List.prototype = new NDDB();
    List.prototype.constructor = List;

    function List(options, data) {
        options = options || {};
        this.options = options;

        NDDB.call(this, options, data);

        this.id = options.id || 'list_' + Math.round(Math.random() * 1000);

        this.DL = null;
        this.auto_update = this.options.auto_update || false;
        this.htmlRenderer = null;
        this.lifo = false;

        this.init(this.options);
    }

    // TODO: improve init
    List.prototype.init = function(options) {
        options = options || this.options;

        this.FIRST_LEVEL = options.first_level || 'dl';
        this.SECOND_LEVEL = options.second_level || 'dt';
        this.THIRD_LEVEL = options.third_level || 'dd';

        this.last_dt = 0;
        this.last_dd = 0;
        this.auto_update = ('undefined' !== typeof options.auto_update) ?
            options.auto_update : this.auto_update;

        var lifo = this.lifo = ('undefined' !== typeof options.lifo) ?
            options.lifo : this.lifo;

        this.globalCompare = function(o1, o2) {
            if (!o1 && !o2) return 0;
            if (!o2) return 1;
            if (!o1) return -1;

            // FIFO
            if (!lifo) {
                if (o1.dt < o2.dt) return -1;
                if (o1.dt > o2.dt) return 1;
            }
            else {
                if (o1.dt < o2.dt) return 1;
                if (o1.dt > o2.dt) return -1;
            }
            if (o1.dt === o2.dt) {
                if ('undefined' === typeof o1.dd) return -1;
                if ('undefined'=== typeof o2.dd) return 1;
                if (o1.dd < o2.dd) return -1;
                if (o1.dd > o2.dd) return 1;
                if (o1.nddbid < o2.nddbid) return 1;
                if (o1.nddbid > o2.nddbid) return -1;
            }
            return 0;
        };


        this.DL = options.list || document.createElement(this.FIRST_LEVEL);
        this.DL.id = options.id || this.id;
        if (options.className) {
            this.DL.className = options.className;
        }
        if (this.options.title) {
            this.DL.appendChild(document.createTextNode(options.title));
        }

        // was
        //this.htmlRenderer = new HTMLRenderer({renderers: options.renderer});
        this.htmlRenderer = new HTMLRenderer(options.render);
    };

    List.prototype._add = function(node) {
        if (!node) return;
        //              console.log('about to add node');
        //              console.log(node);
        this.insert(node);
        if (this.auto_update) {
            this.parse();
        }
    };

    List.prototype.addDT = function(elem, dt) {
        if ('undefined' === typeof elem) return;
        this.last_dt++;
        dt = ('undefined' !== typeof dt) ? dt: this.last_dt;
        this.last_dd = 0;
        var node = new Node({dt: dt, content: elem});
        return this._add(node);
    };

    List.prototype.addDD = function(elem, dt, dd) {
        if ('undefined' === typeof elem) return;
        dt = ('undefined' !== typeof dt) ? dt: this.last_dt;
        dd = ('undefined' !== typeof dd) ? dd: this.last_dd++;
        var node = new Node({dt: dt, dd: dd, content: elem});
        return this._add(node);
    };

    List.prototype.parse = function() {
        this.sort();
        var old_dt = null;
        var old_dd = null;

        var appendDT = function() {
            var node = document.createElement(this.SECOND_LEVEL);
            this.DL.appendChild(node);
            old_dd = null;
            old_dt = node;
            return node;
        };

        var appendDD = function() {
            var node = document.createElement(this.THIRD_LEVEL);
            //                  if (old_dd) {
            //                          old_dd.appendChild(node);
            //                  }
            //                  else if (!old_dt) {
            //                          old_dt = appendDT.call(this);
            //                  }
            //                  old_dt.appendChild(node);
            this.DL.appendChild(node);
            //                  old_dd = null;
            //                  old_dt = node;
            return node;
        };

        // Reparse all every time
        // TODO: improve this
        if (this.DL) {
            while (this.DL.hasChildNodes()) {
                this.DL.removeChild(this.DL.firstChild);
            }
            if (this.options.title) {
                this.DL.appendChild(
                    document.createTextNode(this.options.title));
            }
        }

        for (var i=0; i<this.db.length; i++) {
            var el = this.db[i];
            var node;
            if ('undefined' === typeof el.dd) {
                node = appendDT.call(this);
                //console.log('just created dt');
            }
            else {
                node = appendDD.call(this);
            }
            var content = this.htmlRenderer.render(el);
            node.appendChild(content);
        }
        return this.DL;
    };

    List.prototype.getRoot = function() {
        return this.DL;
    };

    // Cell Class
    Node.prototype = new Entity();
    Node.prototype.constructor = Node;

    function Node (node) {
        Entity.call(this, node);
        this.dt = ('undefined' !== typeof node.dt) ? node.dt : null;
        if ('undefined' !== typeof node.dd) {
            this.dd = node.dd;
        }
    }

})(
    ('undefined' !== typeof node) ? (('undefined' !== typeof node.window) ?
        node.window : node) : module.parent.exports,
    ('undefined' !== typeof node) ? node : module.parent.exports
);

/**
 * # Table
 * Copyright(c) 2015 Stefano Balietti
 * MIT Licensed
 *
 * Creates an HTML table that can be manipulated by an api.
 *
 * www.nodegame.org
 */
(function(exports, window, node) {

    "use strict";

    var document = window.document;

    exports.Table = Table;
    exports.Table.Cell = Cell;

    var J = node.JSUS;
    var NDDB = node.NDDB;
    var HTMLRenderer = node.window.HTMLRenderer;
    var Entity = node.window.HTMLRenderer.Entity;

    Table.prototype = new NDDB();
    Table.prototype.constructor = Table;

    // ## Helper functions

    /**
     * ### validateInput
     *
     * Validates user input and throws an error if input is not correct
     *
     * @param {string} method The name of the method validating the input
     * @param {mixed} data The data that will be inserted in the database
     * @param {number} x Optional. The row index
     * @param {number} y Optional. The column index
     * @param {boolean} dataArray TRUE, if data should be an array
     *
     * @return {boolean} TRUE, if input passes validation
     */
    function validateInput(method, data, x, y, dataArray) {

        if (x && 'number' !== typeof x) {
            throw new TypeError('Table.' + method + ': x must be number or ' +
                                'undefined.');
        }
        if (y && 'number' !== typeof y) {
            throw new TypeError('Table.' + method + ': y must be number or ' +
                                'undefined.');
        }

        if (dataArray && !J.isArray(data)) {
            throw new TypeError('Table.' + method + ': data must be array.');
        }

        return true;
    }

    /**
     * ### Table.addClass
     *
     * Adds a CSS class to each element cell in the table
     *
     * @param {string|array} className The name of the class/classes
     *
     * @return {Table} This instance for chaining
     */
    Table.prototype.addClass = function(className) {
        if ('string' !== typeof className && !J.isArray(className)) {
            throw new TypeError('Table.addClass: className must be string or ' +
                                'array.');
        }
        if (J.isArray(className)) {
            className = className.join(' ');
        }

        this.each(function(el) {
            W.addClass(el, className);
            if (el.HTMLElement) {
                el.HTMLElement.className = el.className;
            }
        });

        return this;
    };

    /**
     * ### Table.removeClass
     *
     * Removes a CSS class from each element cell in the table
     *
     * @param {string|array} className The name of the class/classes
     *
     * @return {Table} This instance for chaining
     */
    Table.prototype.removeClass = function(className) {
        var func;
        if ('string' !== typeof className && !J.isArray(className)) {
            throw new TypeError('Table.removeClass: className must be string ' +
                                'or array.');
        }

        if (J.isArray(className)) {
            func = function(el, className) {
                for (var i = 0; i < className.length; i++) {
                    W.removeClass(el, className[i]);
                }
            };
        }
        else {
            func = W.removeClass;
        }

        this.each(function(el) {
            func.call(this, el, className);
            if (el.HTMLElement) {
                el.HTMLElement.className = el.className;
            }
        });

        return this;
    };

    /**
     * ### addSpecialCells
     *
     * Parses an array of data and returns an array of cells
     *
     * @param {array} data Array containing data to transform into cells
     *
     * @return {array} The array of cells
     */
    function addSpecialCells(data) {
        var out, i, len;
        out = [];
        i = -1;
        len = data.length;
        for ( ; ++i < len ; ) {
            out.push({content: data[i]});
        }
        return out;
    }

    /**
     * ## Table constructor
     *
     * Creates a new Table object
     *
     * @param {object} options Optional. Configuration for NDDB
     * @param {array} data Optional. Array of initial items
     */
    function Table(options, data) {
        options = options || {};

        // Updates indexes on the fly.
        if (!options.update) options.update = {};

        if ('undefined' === typeof options.update.indexes) {
            options.update.indexes = true;
        }

        NDDB.call(this, options, data);

        //if (!this.row) {
        //    this.view('row', function(c) {
        //        return c.x;
        //    });
        //}
        //if (!this.col) {
        //    this.view('col', function(c) {
        //        return c.y;
        //    });
        //}
        if (!this.rowcol) {
            this.index('rowcol', function(c) {
                return c.x + '_' + c.y;
            });
        }

        /**
         * ### Table.pointers
         *
         * References to last inserted cell coordinates
         */
        this.pointers = {
            x: options.pointerX || null,
            y: options.pointerY || null
        };

        /**
         * ### Table.header
         *
         * Array containing the header elements of the table
         */
        this.header = [];

        /**
         * ### Table.footer
         *
         * Array containing the footer elements of the table
         */
        this.footer = [];

        /**
         * ### Table.left
         *
         * Array containing elements to keep on the left border of the table
         */
        this.left = [];

        /**
         * ### Table.table
         *
         * Reference to the HTMLElement Table
         */
        this.table = options.table || document.createElement('table');

        if ('undefined' !== typeof options.id) {
            this.table.id = options.id;
        }

        if ('undefined' !== typeof options.className) {
            this.table.className = options.className;
        }

        /**
         * ### Table.missingClassName
         *
         * Class name for "missing" cells
         *
         * "Missing" cells are cells that are added automatically to complete
         * the table because one or more cells have been added with higher
         * row and column indexes.
         */
        this.missingClassName = options.missingClassName || 'missing';

        /**
         * ### Table.autoParse
         *
         * If TRUE, whenever a new cell is added the table is updated.
         * Default: FALSE
         */
        this.autoParse = 'undefined' !== typeof options.autoParse ?
            options.autoParse : false;

        // Init renderer.
        this.initRenderer(options.render);
    }

    // ## Table methods

    /**
     * ### Table.initRenderer
     *
     * Creates the `HTMLRenderer` object and adds a renderer for objects
     *
     * Every cell in the table will be rendered according to the criteria
     * added to the renderer object.
     *
     * @param {object} options Optional. Configuration for the renderer
     *
     * @see HTMLRenderer
     * @see HTMLRenderer.addRenderer
     */
    Table.prototype.initRenderer = function(options) {
        options = options || {};
        this.htmlRenderer = new HTMLRenderer(options);
        this.htmlRenderer.addRenderer(function(el) {
            var tbl, key;
            if ('object' === typeof el.content) {
                tbl = new Table();
                for (key in el.content) {
                    if (el.content.hasOwnProperty(key)) {
                        tbl.addRow([key, el.content[key]]);
                    }
                }
                return tbl.parse();
            }
        }, 2);
    };

    /**
     * ### Table.renderCell
     *
     * Create a cell element (td, th, etc.) and renders its content
     *
     * It also adds an internal reference to the newly created TD/TH element
     *
     * @param {Cell} cell The cell to transform in element
     * @param {string} tagName The name of the tag. Default: 'td'
     *
     * @return {HTMLElement} The newly created HTML Element (TD/TH)
     *
     * @see Table.htmlRenderer
     * @see Cell
     */
    Table.prototype.renderCell = function(cell, tagName) {
        var TD, content;
        if (!cell) return;
        tagName = tagName || 'td';
        TD = document.createElement(tagName);
        content = this.htmlRenderer.render(cell);
        TD.appendChild(content);
        if (cell.className) TD.className = cell.className;
        // Adds a reference inside the cell.
        cell.HTMLElement = TD;
        return TD;
    };

    /**
     * ### Table.get
     *
     * Returns the element at row column (row,col)
     *
     * @param {number} row The row number
     * @param {number} col The column number
     *
     * @see HTMLRenderer
     * @see HTMLRenderer.addRenderer
     */
    Table.prototype.get = function(row, col) {
        if ('undefined' !== typeof row && 'number' !== typeof row) {
            throw new TypeError('Table.get: row must be number.');
        }
        if ('undefined' !== typeof col && 'number' !== typeof col) {
            throw new TypeError('Table.get: col must be number.');
        }

        if ('undefined' === typeof row) {
            return this.select('y', '=', col);
        }
        if ('undefined' === typeof col) {
            return this.select('x', '=', row);
        }

        return this.rowcol.get(row + '_' + col);
    };

    /**
     * ### Table.getTR
     *
     * Returns a reference to the TR element at row (row)
     *
     * @param {number} row The row number
     *
     * @return {HTMLElement|boolean} The requested TR object, or FALSE if it
     *   cannot be found
     */
    Table.prototype.getTR = function(row) {
        var cell;
        if ('number' !== typeof row) {
            throw new TypeError('Table.getTr: row must be number.');
        }
        cell = this.get(row, 0);
        if (!cell) return false;
        if (!cell.HTMLElement) return false;
        return cell.HTMLElement.parentNode;
    };

    /**
     * ### Table.setHeader
     *
     * Sets the names of the header elements on top of the table
     *
     * @param {string|array} header Array of strings representing the names
     *   of the header elements
     */
    Table.prototype.setHeader = function(header) {
        if (!validateInput('setHeader', header, null, null, true)) return;
        this.header = addSpecialCells(header);
    };

    /**
     * ### Table.setLeft
     *
     * Sets the element of a column that will be added to the left of the table
     *
     * @param {string|array} left Array of strings representing the names
     *   of the left elements
     */
    Table.prototype.setLeft = function(left) {
        if (!validateInput('setLeft', left, null, null, true)) return;
        this.left = addSpecialCells(left);
    };

    /**
     * ### Table.setFooter
     *
     * Sets the names of the footer elements at the bottom of the table
     *
     * @param {string|array} footer Array of strings representing the names
     *   of the footer elements
     */
    Table.prototype.setFooter = function(footer) {
        if (!validateInput('setFooter', footer, null, null, true)) return;
        this.footer = addSpecialCells(footer);
    };

    /**
     * ### Table.updatePointer
     *
     * Updates the reference to the foremost element in the table
     *
     * The pointer is updated only if the suggested value is larger than
     * the current one.
     *
     * @param {string} pointer The name of pointer ('x', 'y')
     * @param {number} value The new value for the pointer
     *
     * @return {boolean|number} The updated value of the pointer, or FALSE,
     *   if an invalid pointer was selected
     *
     * @see Table.pointers
     */
    Table.prototype.updatePointer = function(pointer, value) {
        if ('undefined' === typeof this.pointers[pointer]) {
            node.err('Table.updatePointer: invalid pointer: ' + pointer);
            return false;
        }
        if (this.pointers[pointer] === null || value > this.pointers[pointer]) {
            this.pointers[pointer] = value;
        }
        return this.pointers[pointer];
    };

    /**
     * ### Table.addMultiple
     *
     * Primitive to add multiple cells in column or row form
     *
     * @param {array} data The cells to add
     * @param {string} dim The dimension of followed by the insertion:
     *   'y' inserts as a row, and 'x' inserts as a column.
     * @param {number} x Optional. The row at which to start the insertion.
     *   Default: the current x pointer
     * @param {number} y Optional. The column at which to start the insertion.
     *   Default: the current y pointer
     */
    Table.prototype.addMultiple = function(data, dim, x, y) {
        var i, lenI, j, lenJ;
        if (!validateInput('addMultiple', data, x, y)) return;
        if ((dim && 'string' !== typeof dim) ||
            (dim && 'undefined' === typeof this.pointers[dim])) {
            throw new TypeError('Table.addMultiple: dim must be a valid ' +
                                'string (x, y) or undefined.');
        }
        dim = dim || 'x';

        // Horizontal increment: dim === y.
        x = this.getCurrPointer('x', x);
        y = this.getNextPointer('y', y);

        // By default, only the second dimension is incremented, so we move
        x = 'undefined' !== typeof x ? x :
            this.pointers.x === null ? 0 : this.pointers.x;
        y = 'undefined' !== typeof y ? y :
            this.pointers.y === null ? 0 : this.pointers.y;

        if (!J.isArray(data)) data = [data];

        // Loop Dim 1.
        i = -1;
        lenI = data.length;
        for ( ; ++i < lenI ; ) {

            if (!J.isArray(data[i])) {
                if (dim === 'x') this.add(data[i], x, y + i, 'x');
                else this.add(data[i], x + i, y, 'y');
            }
            else {
                // Loop Dim 2.
                j = -1;
                lenJ = data[i].length;
                for ( ; ++j < lenJ ; ) {
                    if (dim === 'x') this.add(data[i][j], x + i, y + j, 'x');
                    else this.add(data[i][j], x + j, y + i, 'y');
                }
            }
        }

        if (this.autoParse) {
            this.parse();
        }
    };

    /**
     * ### Table.add
     *
     * Adds a single cell to the table
     *
     * @param {object} content The content of the cell or Cell object
     */
    Table.prototype.add = function(content, x, y, dim) {
        var cell;
        if (!validateInput('addData', content, x, y)) return;
        if ((dim && 'string' !== typeof dim) ||
            (dim && 'undefined' === typeof this.pointers[dim])) {
            throw new TypeError('Table.add: dim must be a valid string ' +
                                '(x, y) or undefined.');
        }
        dim = dim || 'x';

        // Horizontal increment: dim === y.
        x = dim === 'y' ?
            this.getCurrPointer('x', x) : this.getNextPointer('x', x);
        y = dim === 'y' ?
            this.getNextPointer('y', y) : this.getCurrPointer('y', y);

        cell = new Cell({
            x: x,
            y: y,
            content: content
        });

        this.insert(cell);

        this.updatePointer('x', x);
        this.updatePointer('y', y);
    };

    /**
     * ### Table.addColumn
     *
     * Adds a new column into the table
     *
     * @param {array} data The array of data to add in column form
     * @param {number} x Optional. The row to which the column will be added.
     *   Default: row 0
     * @param {number} y Optional. The column next to which the new column
     *   will be added. Default: the last column in the table
     */
    Table.prototype.addColumn = function(data, x, y) {
        if (!validateInput('addColumn', data, x, y)) return;
        return this.addMultiple(data, 'y', x || 0, this.getNextPointer('y', y));
    };

    /**
     * ### Table.addRow
     *
     * Adds a new row into the table
     *
     * @param {array} data The array of data to add in row form
     * @param {number} x Optional. The row index at which the new row will be
     *   added. Default: after the last row
     * @param {number} y Optional. The column next to which the new row
     *   will be added. Default: column 0
     */
    Table.prototype.addRow = function(data, x, y) {
        if (!validateInput('addRow', data, x, y)) return;
        return this.addMultiple(data, 'x', this.getNextPointer('x', x), y || 0);
    };

    /**
     * ### Table.getNextPointer
     *
     * Returns the value of the pointer plus 1 for the requested dimension (x,y)
     *
     * @param {string} dim The dimension x or y
     * @param {value} value Optional. If set, returns this value
     *
     * @return {number} The requested pointer
     */
    Table.prototype.getNextPointer = function(dim, value) {
        if ('undefined' !== typeof value) return value;
        return this.pointers[dim] === null ? 0 : this.pointers[dim] + 1;
    };

    /**
     * ### Table.getCurrPointer
     *
     * Returns the value of the pointer for the requested dimension (x,y)
     *
     * @param {string} dim The dimension x or y
     * @param {value} value Optional. If set, returns this value
     *
     * @return {number} The requested pointer
     */
    Table.prototype.getCurrPointer = function(dim, value) {
        if ('undefined' !== typeof value) return value;
        return this.pointers[dim] === null ? 0 : this.pointers[dim];
    };

    /**
     * ### Table.parse
     *
     * Reads cells currently in database and builds up an HTML table
     *
     * It destroys the existing table, before parsing the database again.
     *
     * @see Table.db
     * @see Table.table
     * @see Cell
     */
    Table.prototype.parse = function() {
        var TABLE, TR, TD, THEAD, TBODY, TFOOT;
        var i, j, len;
        var trid, f, old_y, old_left;
        var diff;

        // TODO: we could find a better way to update a table, instead of
        // removing and re-inserting everything.
        if (this.table && this.table.children) {
            this.table.innerHTML = '';
            // TODO: which one is faster?
            // while (this.table.hasChildNodes()) {
            //     this.table.removeChild(this.table.firstChild);
            // }
        }

        TABLE = this.table;

        // HEADER
        if (this.header && this.header.length) {
            THEAD = document.createElement('thead');
            TR = document.createElement('tr');

            // Add an empty cell to balance the left header column.
            if (this.left && this.left.length) {
                TR.appendChild(document.createElement('th'));
            }
            i = -1;
            len = this.header.length;
            for ( ; ++i < len ; ) {
                TR.appendChild(this.renderCell(this.header[i], 'th'));
            }
            THEAD.appendChild(TR);
            TABLE.appendChild(THEAD);
        }

        // BODY
        if (this.size()) {
            TBODY = document.createElement('tbody');

            this.sort(['x','y']);

            // Forces to create a new TR element.
            trid = -1;

            // TODO: What happens if the are missing at the beginning ??
            f = this.first();
            old_y = f.y;
            old_left = 0;


            i = -1;
            len = this.db.length;
            for ( ; ++i < len ; ) {

                if (trid !== this.db[i].x) {
                    TR = document.createElement('tr');
                    TBODY.appendChild(TR);

                    // Keep a reference to current TR idx.
                    trid = this.db[i].x;

                    old_y = f.y - 1; // must start exactly from the first

                    // Insert left header, if any.
                    if (this.left && this.left.length) {
                        TD = document.createElement('td');
                        //TD.className = this.missing;
                        TR.appendChild(this.renderCell(this.left[old_left]));
                        old_left++;
                    }
                }

                // Insert missing cells.
                if (this.db[i].y > old_y + 1) {
                    diff = this.db[i].y - (old_y + 1);
                    for (j = 0; j < diff; j++ ) {
                        TD = document.createElement('td');
                        TD.className = this.missingClassName;
                        TR.appendChild(TD);
                    }
                }
                // Normal Insert.
                TR.appendChild(this.renderCell(this.db[i]));

                // Update old refs.
                old_y = this.db[i].y;
            }
            TABLE.appendChild(TBODY);
        }


        // FOOTER.
        if (this.footer && this.footer.length) {
            TFOOT = document.createElement('tfoot');
            TR = document.createElement('tr');


            if (this.header && this.header.length) {
                TD = document.createElement('td');
                TR.appendChild(TD);
            }

            i = -1;
            len = this.footer.length;
            for ( ; ++i < len ; ) {
                TR.appendChild(this.renderCell(this.footer[i]));
            }
            TFOOT.appendChild(TR);
            TABLE.appendChild(TFOOT);
        }

        return TABLE;
    };

    /**
     * ### Table.resetPointers
     *
     * Reset all pointers to 0 or to the value of the input parameter
     *
     * @param {object} pointers Optional. Objects contains the new pointers
     */
    Table.prototype.resetPointers = function(pointers) {
        if (pointers && 'object' !== typeof pointers) {
            throw new TypeError('Table.resetPointers: pointers must be ' +
                                'object or undefined.');
        }
        pointers = pointers || {};
        this.pointers = {
            x: pointers.pointerX || 0,
            y: pointers.pointerY || 0
        };
    };

    /**
     * ### Table.clear
     *
     * Removes all entries and indexes, and resets the pointers
     *
     * @param {boolean} confirm TRUE, to confirm the operation.
     *
     * @see NDDB.clear
     */
    Table.prototype.clear = function(confirm) {
        if (NDDB.prototype.clear.call(this, confirm)) {
            this.resetPointers();
        }
    };

    // # Cell

    Cell.prototype = new Entity();
    Cell.prototype.constructor = Cell;

    /**
     * ## Cell constructor
     *
     * Creates a new Table Cell
     *
     * @param {object} cell An object containing the coordinates in the table
     *
     * @see Entity
     * @see Table
     */
    function Cell(cell) {
        // Adds property: className and content.
        Entity.call(this, cell);

        /**
         * ### Cell.x
         *
         * The row number
         */
        this.x = 'undefined' !== typeof cell.x ? cell.x : null;

        /**
         * ### Cell.y
         *
         * The column number
         */
        this.y = 'undefined' !== typeof cell.y ? cell.y : null;

        /**
         * ### Cell.tdElement
         *
         * Reference to the TD/TH element, if built already
         */
        this.HTMLElement = cell.HTMLElement || null;

    }

})(
    ('undefined' !== typeof node) ? node.window || node : module.exports,
    ('undefined' !== typeof window) ? window : module.parent.exports.window,
    ('undefined' !== typeof node) ? node : module.parent.exports.node
);
