// Geometric objects

/**
 * A bézier path containing a set of path commands similar to a SVG path.
 * Paths can be drawn on a context using `draw`.
 * @exports opentype.Path
 * @class
 * @constructor
 */
function Path() {
    this.commands = [];
    this.fill = 'black';
    this.stroke = null;
    this.strokeWidth = 1;
    // the _layer property is only set on computed paths during glyph rendering
    // this._layers = [];
}

const decimalRoundingCache = {};

function roundDecimal(float, places) {
    const integerPart = Math.floor(float);
    const decimalPart = float - integerPart;

    if (!decimalRoundingCache[places]) {
        decimalRoundingCache[places] = {};
    }

    if (decimalRoundingCache[places][decimalPart] !== undefined) {
        const roundedDecimalPart = decimalRoundingCache[places][decimalPart];
        return integerPart + roundedDecimalPart;
    }
    
    const roundedDecimalPart = +(Math.round(decimalPart + 'e+' + places) + 'e-' + places);
    decimalRoundingCache[places][decimalPart] = roundedDecimalPart;

    return integerPart + roundedDecimalPart;
}

function optimizeCommands(commands) {
    // separate subpaths
    let subpaths = [[]];
    let startX = 0,
        startY = 0;
    for (let i = 0; i < commands.length; i += 1) {
        const subpath = subpaths[subpaths.length - 1];
        const cmd = commands[i];
        const firstCommand = subpath[0];
        const secondCommand = subpath[1];
        const previousCommand = subpath[subpath.length - 1];
        const nextCommand = commands[i + 1];
        subpath.push(cmd);
        
        if (cmd.type === 'M') {
            startX = cmd.x;
            startY = cmd.y;
        } else if (cmd.type === 'L' && (!nextCommand || nextCommand.command === 'Z')) {
            if(!(Math.abs(cmd.x - startX) > 1 || Math.abs(cmd.y - startY) > 1)) {
                subpath.pop();
            }
        } else if (cmd.type === 'L' && previousCommand && previousCommand.x === cmd.x && previousCommand.y === cmd.y) {
            subpath.pop();
        } else if (cmd.type === 'Z') {
            // When closing at the same position as the path started,
            // remove unnecessary line command
            if (
                firstCommand &&
                secondCommand &&
                previousCommand &&
                firstCommand.type === 'M' &&
                secondCommand.type === 'L' &&
                previousCommand.type === 'L' &&
                previousCommand.x === firstCommand.x &&
                previousCommand.y === firstCommand.y
            ) {
                subpath.shift();
                subpath[0].type = 'M';
            }

            if (i + 1 < commands.length) {
                subpaths.push([]);
            }
        }
    }
    commands = [].concat.apply([], subpaths); // flatten again
    return commands;
}

/**
 * Returns options merged with the default options for outputting SVG data
 * @param {object} options (optional)
 */
function createSVGOutputOptions(options) {
    // accept number for backwards compatibility
    if (parseInt(options) === options) {
        options = { decimalPlaces: options, flipY: false };
    }
    const defaultOptions = {
        decimalPlaces: 2,
        optimize: true,
    };
    const newOptions = Object.assign({}, defaultOptions, options);
    return newOptions;
}

/**
 * @param  {number} x
 * @param  {number} y
 */
Path.prototype.moveTo = function(x, y) {
    this.commands.push({
        type: 'M',
        x: x,
        y: y
    });
};

/**
 * @param  {number} x
 * @param  {number} y
 */
Path.prototype.lineTo = function(x, y) {
    this.commands.push({
        type: 'L',
        x: x,
        y: y
    });
};

/**
 * Draws cubic curve
 * @function
 * curveTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control 1
 * @param  {number} y1 - y of control 1
 * @param  {number} x2 - x of control 2
 * @param  {number} y2 - y of control 2
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 */

/**
 * Draws cubic curve
 * @function
 * bezierCurveTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control 1
 * @param  {number} y1 - y of control 1
 * @param  {number} x2 - x of control 2
 * @param  {number} y2 - y of control 2
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 * @see curveTo
 */
Path.prototype.curveTo = Path.prototype.bezierCurveTo = function(x1, y1, x2, y2, x, y) {
    this.commands.push({
        type: 'C',
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        x: x,
        y: y
    });
};

/**
 * Draws quadratic curve
 * @function
 * quadraticCurveTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control
 * @param  {number} y1 - y of control
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 */

/**
 * Draws quadratic curve
 * @function
 * quadTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control
 * @param  {number} y1 - y of control
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 */
Path.prototype.quadTo = Path.prototype.quadraticCurveTo = function(x1, y1, x, y) {
    this.commands.push({
        type: 'Q',
        x1: x1,
        y1: y1,
        x: x,
        y: y
    });
};

/**
 * Closes the path
 * @function closePath
 * @memberof opentype.Path.prototype
 */

/**
 * Close the path
 * @function close
 * @memberof opentype.Path.prototype
 */
Path.prototype.close = Path.prototype.closePath = function() {
    this.commands.push({
        type: 'Z'
    });
};

/**
 * Add the given path or list of commands to the commands of this path.
 * @param  {Array} pathOrCommands - another opentype.Path, an opentype.BoundingBox, or an array of commands.
 */
Path.prototype.extend = function(pathOrCommands) {
    if (pathOrCommands.commands) {
        pathOrCommands = pathOrCommands.commands;
    } else if (pathOrCommands instanceof BoundingBox) {
        const box = pathOrCommands;
        this.moveTo(box.x1, box.y1);
        this.lineTo(box.x2, box.y1);
        this.lineTo(box.x2, box.y2);
        this.lineTo(box.x1, box.y2);
        this.close();
        return;
    }

    Array.prototype.push.apply(this.commands, pathOrCommands);
};

/**
 * Convert the Path to a string of path data instructions
 * See http://www.w3.org/TR/SVG/paths.html#PathData
 * @param  {object|number} [options={decimalPlaces:2, optimize:true}] - Options object (or amount of decimal places for floating-point values for backwards compatibility)
 * @return {string}
 */
Path.prototype.toPathData = function(options) {
    // set/merge default options
    options = createSVGOutputOptions(options);

    function floatToString(v) {
        const rounded = roundDecimal(v, options.decimalPlaces);
        if (Math.round(v) === rounded) {
            return '' + rounded;
        } else {
            return rounded.toFixed(options.decimalPlaces);
        }
    }

    function packValues() {
        let s = '';
        for (let i = 0; i < arguments.length; i += 1) {
            const v = arguments[i];
            if (v >= 0 && i > 0) {
                s += ' ';
            }

            s += floatToString(v);
        }

        return s;
    }

    let commandsCopy = this.commands;
    if (options.optimize) {
        // apply path optimizations
        commandsCopy = JSON.parse(JSON.stringify(this.commands)); // make a deep clone
        commandsCopy = optimizeCommands(commandsCopy);
    }

    let d = '';
    for (let i = 0; i < commandsCopy.length; i += 1) {
        const cmd = commandsCopy[i];
        if (cmd.type === 'M') {
            d += 'M' + packValues(
                cmd.x,
                cmd.y
            );
        } else if (cmd.type === 'L') {
            d += 'L' + packValues(
                cmd.x,
                cmd.y
            );
        } else if (cmd.type === 'C') {
            d += 'C' + packValues(
                cmd.x1,
                cmd.y1,
                cmd.x2,
                cmd.y2,
                cmd.x,
                cmd.y
            );
        } else if (cmd.type === 'Q') {
            d += 'Q' + packValues(
                cmd.x1,
                cmd.y1,
                cmd.x,
                cmd.y
            );
        } else if (cmd.type === 'Z') {
            d += 'Z';
        }
    }

    return d;
};

export default Path;
