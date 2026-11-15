'use strict';

var segments = require('data-files!segments');

var
  QUnit = require('qunit'),
  probe = require('../lib/m2ts/probe.js'),
  utils = require('./utils'),
  testSegment = segments['test-segment.ts'](),
  stuffedPesPacket = segments['test-stuffed-pes.ts']();

/**
 * All subarray indices verified with the use of thumbcoil.
 */
var patPacket = testSegment.subarray(188, 376);
var pmtPid = 4095;
var programMapTable = {
  256: 0x1B,
  257: 0x0F
};
var pmtPacket = testSegment.subarray(376, 564);
var pesPacket = testSegment.subarray(564, 752);
var videoPacket = testSegment.subarray(564, 1692);
var videoNoKeyFramePacket = testSegment.subarray(1880, 2820);
var audioPacket = testSegment.subarray(6956, 7144);
var notPusiPacket = testSegment.subarray(1316, 1504);

QUnit.module('M2TS Probe');

QUnit.test('correctly parses packet type', function(assert) {
  assert.equal(probe.parseType(patPacket), 'pat', 'parses pat type');
  assert.equal(probe.parseType(pmtPacket), null,
    'cannot determine type of pmt packet when pmt pid has not been parsed yet');
  assert.equal(probe.parseType(pmtPacket, pmtPid), 'pmt', 'parses pmt type');
  assert.equal(probe.parseType(pesPacket), null,
    'cannot determine type of pes packet when pmt pid has not been parsed yet');
  assert.equal(probe.parseType(pesPacket, pmtPid), 'pes', 'parses pes type');
});

QUnit.test('correctly parses pmt pid from pat packet', function(assert) {
  assert.equal(probe.parsePat(patPacket), pmtPid, 'parses pmt pid from pat');
});

QUnit.test('correctly parses all program entries from pat packets', function(assert) {
  assert.deepEqual(probe.parsePatPrograms(patPacket), [{
    programNumber: 1,
    pid: pmtPid
  }], 'parses the single program of a single-program pat');

  var multiProgramPat = utils.packetize(utils.generateMultiProgramPAT([
    // NIT, program_number 0
    {programNumber: 0, pid: 0x10},
    // audio-only companion program
    {programNumber: 1, pid: 0x100},
    // main program with video
    {programNumber: 2, pid: 0x101}
  ]));

  assert.deepEqual(probe.parsePatPrograms(multiProgramPat), [
    {programNumber: 0, pid: 0x10},
    {programNumber: 1, pid: 0x100},
    {programNumber: 2, pid: 0x101}
  ], 'parses every program entry of a multi-program pat');
});

QUnit.test('correctly parses packet type with a list of pmt pids', function(assert) {
  assert.equal(probe.parseType(pmtPacket, []), null,
    'cannot determine type of pmt packet with an empty pmt pid list');
  assert.equal(probe.parseType(pmtPacket, [0x10, pmtPid]), 'pmt',
    'parses pmt type when the pmt pid is in the list');
  assert.equal(probe.parseType(pesPacket, [0x10, pmtPid]), 'pes',
    'parses pes type when the pmt pid is in the list');
});

QUnit.test('correctly parses program map table from pmt packet', function(assert) {
  assert.deepEqual(probe.parsePmt(pmtPacket), programMapTable, 'generates correct pmt');
});

QUnit.test('correctly parses payload unit start indicator', function(assert) {
  assert.ok(probe.parsePayloadUnitStartIndicator(pesPacket),
    'detects payload unit start indicator');
  assert.ok(!probe.parsePayloadUnitStartIndicator(notPusiPacket),
    'detects no payload unit start indicator');
});

QUnit.test('correctly parses type of pes packet', function(assert) {
  assert.equal(probe.parsePesType(videoPacket, programMapTable), 'video',
    'parses video pes type');
  assert.equal(probe.parsePesType(audioPacket, programMapTable), 'audio',
    'parses audio pes type');
});

QUnit.test('correctly parses dts and pts values of pes packet', function(assert) {
  var videoPes = probe.parsePesTime(videoPacket);
  assert.equal(videoPes.dts, 126000, 'correct dts value');
  assert.equal(videoPes.pts, 126000, 'correct pts value');

  videoPes = probe.parsePesTime(stuffedPesPacket);
  assert.equal(videoPes, null,
    'correctly returned null when there is no packet data, only stuffing');
});

QUnit.test('correctly determines if video pes packet contains a key frame', function(assert) {
  assert.ok(probe.videoPacketContainsKeyFrame(videoPacket), 'detects key frame in packet');
  assert.ok(!probe.videoPacketContainsKeyFrame(videoNoKeyFramePacket),
    'detects no key frame in packet');
});
