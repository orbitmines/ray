// The `hvar` table stores variation data for the hmtx table.
// https://learn.microsoft.com/en-us/typography/opentype/spec/hvar

import parse from '../parse.mjs';

function parseHvarTable(data, start) {
    const p = new parse.Parser(data, start);
    const tableVersionMajor = p.u16();
    const tableVersionMinor = p.u16();

    if (tableVersionMajor !== 1) {
        console.warn(`Unsupported hvar table version ${tableVersionMajor}.${tableVersionMinor}`);
    }

    const version = [
        tableVersionMajor, tableVersionMinor
    ];

    const itemVariationStore = p.parsePointer32(function() {
        return this.parseItemVariationStore();
    });
    const advanceWidth = p.parsePointer32(function() {
        return this.parseDeltaSetIndexMap();
    }); 
    const lsb = p.parsePointer32(function() {
        return this.parseDeltaSetIndexMap();
    }); 
    const rsb = p.parsePointer32(function() {
        return this.parseDeltaSetIndexMap();
    }); 
    
    return {
        version,
        itemVariationStore,
        advanceWidth,
        lsb,
        rsb,
    };
}

function makeHvarTable(/*fvar*/) {
    console.warn('Writing of hvar tables is not yet supported.');
}


export default { make: makeHvarTable, parse: parseHvarTable };
