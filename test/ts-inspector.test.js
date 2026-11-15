'use strict';
var segments = require('data-files!segments');

var
  QUnit = require('qunit'),
  tsInspector = require('../lib/tools/ts-inspector.js'),
  StreamTypes = require('../lib/m2ts/stream-types.js'),
  tsSegment = segments['test-segment.ts'](),
  tsNoAudioSegment = segments['test-no-audio-segment.ts'](),
  aacSegment = segments['test-aac-segment.aac'](),
  utils = require('./utils'),
  inspect = tsInspector.inspect,
  parseAudioPes_ = tsInspector.parseAudioPes_,
  packetize = utils.packetize,
  audioPes = utils.audioPes,
  videoPes = utils.videoPes,
  generateMultiProgramPAT = utils.generateMultiProgramPAT,
  generateProgramPMT = utils.generateProgramPMT,
  PES_TIMESCALE = 90000;

QUnit.module('TS Inspector');

QUnit.test('returns null for empty segment input', function(assert) {
  assert.equal(inspect(new Uint8Array([])), null, 'returned null');
});

QUnit.test('can parse a ts segment', function(assert) {
  var expected = {
    video: [
      {
        type: 'video',
        pts: 126000,
        dts: 126000,
        ptsTime: 126000 / PES_TIMESCALE,
        dtsTime: 126000 / PES_TIMESCALE
      },
      {
        type: 'video',
        pts: 924000,
        dts: 924000,
        ptsTime: 924000 / PES_TIMESCALE,
        dtsTime: 924000 / PES_TIMESCALE
      }
    ],
    firstKeyFrame: {
      type: 'video',
      pts: 126000,
      dts: 126000,
      ptsTime: 126000 / PES_TIMESCALE,
      dtsTime: 126000 / PES_TIMESCALE
    },
    audio: [
      {
        type: 'audio',
        pts: 126000,
        dts: 126000,
        ptsTime: 126000 / PES_TIMESCALE,
        dtsTime: 126000 / PES_TIMESCALE
      },
      {
        type: 'audio',
        pts: 859518,
        dts: 859518,
        ptsTime: 859518 / PES_TIMESCALE,
        dtsTime: 859518 / PES_TIMESCALE
      }
    ]
  };

  assert.deepEqual(inspect(tsSegment), expected, 'parses ts segment timing data');
});

QUnit.test('adjusts timestamp values based on provided reference', function(assert) {
  var rollover = Math.pow(2, 33);

  var expected = {
    video: [
      {
        type: 'video',
        pts: (126000 + rollover),
        dts: (126000 + rollover),
        ptsTime: (126000 + rollover) / PES_TIMESCALE,
        dtsTime: (126000 + rollover) / PES_TIMESCALE
      },
      {
        type: 'video',
        pts: (924000 + rollover),
        dts: (924000 + rollover),
        ptsTime: (924000 + rollover) / PES_TIMESCALE,
        dtsTime: (924000 + rollover) / PES_TIMESCALE
      }
    ],
    firstKeyFrame: {
      type: 'video',
      pts: (126000 + rollover),
      dts: (126000 + rollover),
      ptsTime: (126000 + rollover) / PES_TIMESCALE,
      dtsTime: (126000 + rollover) / PES_TIMESCALE
    },
    audio: [
      {
        type: 'audio',
        pts: (126000 + rollover),
        dts: (126000 + rollover),
        ptsTime: (126000 + rollover) / PES_TIMESCALE,
        dtsTime: (126000 + rollover) / PES_TIMESCALE
      },
      {
        type: 'audio',
        pts: (859518 + rollover),
        dts: (859518 + rollover),
        ptsTime: (859518 + rollover) / PES_TIMESCALE,
        dtsTime: (859518 + rollover) / PES_TIMESCALE
      }
    ]
  };

  assert.deepEqual(inspect(tsSegment, rollover - 1), expected,
    'adjusts inspected time data to account for pts rollover');
});

QUnit.test('can parse an aac segment', function(assert) {
  var expected = {
    audio: [
      {
        type: 'audio',
        pts: 895690,
        dts: 895690,
        ptsTime: 895690 / PES_TIMESCALE,
        dtsTime: 895690 / PES_TIMESCALE
      },
      {
        type: 'audio',
        pts: (895690 + (430 * 1024 * PES_TIMESCALE / 44100)),
        dts: (895690 + (430 * 1024 * PES_TIMESCALE / 44100)),
        ptsTime: (895690 + (430 * 1024 * PES_TIMESCALE / 44100)) / PES_TIMESCALE,
        dtsTime: (895690 + (430 * 1024 * PES_TIMESCALE / 44100)) / PES_TIMESCALE
      }
    ]
  };

  assert.deepEqual(inspect(aacSegment), expected, 'parses aac segment timing data');
});

QUnit.test('can parse a ts segment whose PAT declares multiple programs', function(assert) {
  var
    packets = [
      // a NIT entry, an audio-only companion program and the main
      // program carrying video
      generateMultiProgramPAT([
        {programNumber: 0, pid: 0x10},
        {programNumber: 1, pid: 0x100},
        {programNumber: 2, pid: 0x101}
      ]),
      // the companion program's PMT arrives first
      generateProgramPMT(0x100, 1, [
        {streamType: StreamTypes.ADTS_STREAM_TYPE, pid: 0x301}
      ]),
      audioPes([0x19, 0x47], true, 126000, 0x301),
      // the main program: video on 0x202, audio on 0x201
      generateProgramPMT(0x101, 2, [
        {streamType: StreamTypes.H264_STREAM_TYPE, pid: 0x202},
        {streamType: StreamTypes.ADTS_STREAM_TYPE, pid: 0x201}
      ]),
      videoPes([0x09, 0x01], true, 126000, 0x202),
      videoPes([0x05, 0x01], true, 126000, 0x202),
      audioPes([0x19, 0x47], true, 126000, 0x201),
      videoPes([
        0x09, 0x01,
        0x00, 0x00, 0x01,
        0x01, 0x9a
      ], true, 924000, 0x202),
      audioPes([0x29, 0x48], true, 859518, 0x201)
    ],
    segment = new Uint8Array(packets.length * 188),
    expected = {
      video: [
        {
          type: 'video',
          pts: 126000,
          dts: 126000,
          ptsTime: 126000 / PES_TIMESCALE,
          dtsTime: 126000 / PES_TIMESCALE
        },
        {
          type: 'video',
          pts: 924000,
          dts: 924000,
          ptsTime: 924000 / PES_TIMESCALE,
          dtsTime: 924000 / PES_TIMESCALE
        }
      ],
      firstKeyFrame: {
        type: 'video',
        pts: 126000,
        dts: 126000,
        ptsTime: 126000 / PES_TIMESCALE,
        dtsTime: 126000 / PES_TIMESCALE
      },
      audio: [
        {
          type: 'audio',
          pts: 126000,
          dts: 126000,
          ptsTime: 126000 / PES_TIMESCALE,
          dtsTime: 126000 / PES_TIMESCALE
        },
        {
          type: 'audio',
          pts: 859518,
          dts: 859518,
          ptsTime: 859518 / PES_TIMESCALE,
          dtsTime: 859518 / PES_TIMESCALE
        }
      ]
    };

  packets.forEach(function(packet, i) {
    segment.set(packetize(packet), i * 188);
  });

  assert.deepEqual(
    inspect(segment),
    expected,
    'reports audio and video of the main program and ignores the companion program'
  );
});

QUnit.test('can parse ts segment with no audio muxed in', function(assert) {  var expected = {
    video: [
      {
        type: 'video',
        pts: 126000,
        dts: 126000,
        ptsTime: 126000 / PES_TIMESCALE,
        dtsTime: 126000 / PES_TIMESCALE
      },
      {
        type: 'video',
        pts: 924000,
        dts: 924000,
        ptsTime: 924000 / PES_TIMESCALE,
        dtsTime: 924000 / PES_TIMESCALE
      }
    ],
    firstKeyFrame: {
      type: 'video',
      pts: 126000,
      dts: 126000,
      ptsTime: 126000 / PES_TIMESCALE,
      dtsTime: 126000 / PES_TIMESCALE
    }
  };

  var actual = inspect(tsNoAudioSegment);

  assert.equal(typeof actual.audio, 'undefined', 'results do not contain audio info');
  assert.deepEqual(actual, expected,
    'parses ts segment without audio timing data');
});

QUnit.test('can parse audio PES when it\'s the only packet in a stream', function(assert) {
  var
    pts = 90000,
    pmt = {
      // fake pmt pid that doesn't clash with the audio pid
      pid: 0x10,
      table: {
        // pid copied over from default of audioPes function
        0x12: StreamTypes.ADTS_STREAM_TYPE
      }
    },
    result = { audio: [] };

  parseAudioPes_(packetize(audioPes([0x00], true, pts)), pmt, result);

  // note that both the first and last packet timings are the same, as there's only one
  // packet to parse
  assert.deepEqual(
    result.audio,
    [{
      dts: pts,
      pts: pts,
      type: 'audio'
    }, {
      dts: pts,
      pts: pts,
      type: 'audio'
    }],
    'parses audio pes for timing info');
});
