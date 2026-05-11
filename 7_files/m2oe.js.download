// m2oe.js (multi event config)
(function(window, document) {
    'use strict';

    const VERSION = '1.0.7';
    // A dictionary to store configuration (tag_id, segment_key) for each eventName.
    const _eventConfigs = {};

    // Internal configuration variables.
    let _config = {
        baseUrl: 'https://cnv.event.prod.bidr.io/log/cnv'
    };

    // A flag to ensure we process the initial queue only once.
    let isQueueProcessed = false;

    // Helper function to fire the pixel with a specific tag and segment key pair.
    function firePixel(tagId, segmentKey, params) {
        if (!tagId || !segmentKey) {
            console.warn("m2oe: tag_id or segment_key not provided. Pixel not fired.");
            return;
        }

        const cachebuster = Math.floor(Math.random() * 10000000000);
        const img = new Image();
        const queryParams = [`tag_id=${tagId}`, `buzz_key=match2one`, `segment_key=${segmentKey}`];

        // Add any additional parameters passed to this helper
        if (params && Object.keys(params).length > 0) {
            for (const key in params) {
                if (Object.prototype.hasOwnProperty.call(params, key) && params[key]) {
                    queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
                }
            }
        }

        queryParams.push(`ord=${cachebuster}`); // Cachebuster always last

        img.src = `${_config.baseUrl}?${queryParams.join('&')}`;
        // console.log("m2oe pixel fired:", img.src); // For debugging
    }

    // Process a single command.
    function processCommand(command) {
        if (!command || !command.action) {
            return;
        }

        switch (command.action) {
            case 'init':
                // The actionValue is now the eventName (e.g., 'PageView').
                const eventName = command.actionValue;
                // The params should contain the tag_id and segment_key.
                const initParams = command.params;

                if (eventName && initParams && typeof initParams === 'object' && initParams.tag_id && initParams.segment_key) {
                    _eventConfigs[eventName] = {
                        tag_id: initParams.tag_id,
                        segment_key: initParams.segment_key
                    };
                    // console.log(`m2oe: Configuration for event '${eventName}' initialized.`);
                } else {
                    console.warn("m2oe: 'init' command requires an event name and valid tag_id/segment_key parameters.");
                }
                break;

            case 'event':
                // The actionValue is the eventName.
                const eventToTrack = command.actionValue;
                const eventParams = command.params || {};

                // Look up the configuration for the specified event.
                const eventConfig = _eventConfigs[eventToTrack];

                if (!eventConfig) {
                    console.warn(`m2oe: Configuration for event '${eventToTrack}' not found. Event not fired.`);
                    return;
                }

                // Use the retrieved tag_id and segment_key for the pixel call.
                if (eventToTrack === 'PageView') {
                    firePixel(eventConfig.tag_id, eventConfig.segment_key, {});
                } else {
                    const pixelSpecificParams = {};

                    if (eventParams.order_id) {
                        pixelSpecificParams.order = eventParams.order_id;
                    }

                    if (eventParams.order_value) {
                        pixelSpecificParams.value = eventParams.order_currency_code
                            ? `${encodeURIComponent(eventParams.order_currency_code)}:${encodeURIComponent(eventParams.order_value)}`
                            : encodeURIComponent(eventParams.order_value);
                    }
                    firePixel(eventConfig.tag_id, eventConfig.segment_key, pixelSpecificParams);
                }
                break;

            default:
                console.warn(`m2oe: Unknown command action: ${command.action}`);
        }
    }

    var actionQueue = window.m2oe && window.m2oe.actionQueue ? window.m2oe.actionQueue : [];

    // The main public function for the m2oe tag.
    function m2oe() {
        if (!isQueueProcessed && Array.isArray(actionQueue)) {
            while (actionQueue.length > 0) {
                const queuedCommand = actionQueue.shift();
                processCommand(queuedCommand);
            }
            isQueueProcessed = true;
            actionQueue = [];
        }

        const args = Array.prototype.slice.call(arguments);
        const action = args.shift();
        const actionValue = args.shift();
        const params = args.shift();

        processCommand({ action: action, actionValue: actionValue, params: params });
    }

    window.m2oe = m2oe;

    if (!isQueueProcessed && Array.isArray(actionQueue)) {
        m2oe();
    }

})(window, document);