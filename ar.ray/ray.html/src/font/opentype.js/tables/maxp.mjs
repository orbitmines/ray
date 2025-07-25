// The `maxp` table establishes the memory requirements for the font.
// We need it just to get the number of glyphs in the font.
// https://www.microsoft.com/typography/OTSPEC/maxp.htm

import parse from '../parse.mjs';
import table from '../table.mjs';

// Parse the maximum profile `maxp` table.
function parseMaxpTable(data, start) {
    const maxp = {};
    const p = new parse.Parser(data, start);
    maxp.version = p.parseVersion();
    maxp.numGlyphs = p.u16();
    if (maxp.version === 1.0) {
        maxp.maxPoints = p.u16();
        maxp.maxContours = p.u16();
        maxp.maxCompositePoints = p.u16();
        maxp.maxCompositeContours = p.u16();
        maxp.maxZones = p.u16();
        maxp.maxTwilightPoints = p.u16();
        maxp.maxStorage = p.u16();
        maxp.maxFunctionDefs = p.u16();
        maxp.maxInstructionDefs = p.u16();
        maxp.maxStackElements = p.u16();
        maxp.maxSizeOfInstructions = p.u16();
        maxp.maxComponentElements = p.u16();
        maxp.maxComponentDepth = p.u16();
    }

    return maxp;
}

function makeMaxpTable(numGlyphs) {
    return new table.Table('maxp', [
        {name: 'version', type: 'FIXED', value: 0x00005000},
        {name: 'numGlyphs', type: 'USHORT', value: numGlyphs}
    ]);
}

export default { parse: parseMaxpTable, make: makeMaxpTable };
