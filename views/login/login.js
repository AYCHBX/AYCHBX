// hy_login.js - contains javascript for login, encryption and session authentication
var A = animations;
var C = commonUtils;
var H = hybridd;
var S = loginInputStreams;
var U = utils;
var V = validations;

var AssetInitialisation = assetInitialisation;
var BrowserSupport = browserSupport;
var SessionData = sessionData;
var UserCredentialsValidation = userCredentialsValidation;
var UserFeedback = userFeedback;
var WalletMaintenance = walletMaintenance;

var path = 'api'; // TODO: Factor up!
var args = {};

assets = {
  count: 0, // amount of assets
  init: [], // initialization status
  mode: {}, // mode of assets
  modehashes: {}, // mode hashes
  seed: {}, // cryptoseeds of assets
  keys: {}, // keys of assets
  addr: {}, // public addresses of assets
  cntr: {}, // stored contract pointer, location or address
  fact: {}, // factor of assets
  fees: {}, // fees of assets
  fsym: {}, // fees of assets
  base: {} // fees of assets
};

GL = {
  assets: [],
  assetnames: {},
  assetmodes: {},
  coinMarketCapTickers: [],
  powqueue: [],
  usercrypto: {},
  initCount: 0
};

var animationDelayByBrowser = bowser.name === 'Firefox' ? 1000 : 10;

// Don't move this yet, as the cur_step is needed by assetModesUrl. Synchronous coding!
nacl_factory.instantiate(function (naclinstance) { nacl = naclinstance; }); // TODO
session_step = 1; // Session step number at the end of login. TODO

/// /////////////////////////////
// GLOBAL STUFFZ ///////////////
/// /////////////////////////////

// TODO:
// - Remove global session_step --> Make into incremental counter (save in state)
// - Remove Nacl as a global and save in some state
// - Put Ctrl-S event in Stream
// - Factor 'path' up

// - Fix HACK for priority queue

var keyDownOnUserIDStream = S.mkInputStream('#inputUserID');

function main () {
  BrowserSupport.checkBrowserSupport(window.navigator.userAgent);
  WalletMaintenance.mkTestHybriddAvailabilityStream().subscribe();
  maybeOpenNewWalletModal(location);
  document.keydown = handleCtrlSKeyEvent; // for legacy wallets enable signin button on CTRL-S
  keyDownOnUserIDStream.subscribe(function (_) { document.querySelector('#inputPasscode').focus(); });
  UserCredentialsValidation.credentialsOrErrorStream
    .pipe(
      rxjs.operators.tap(function (_) { UserFeedback.doFlipOverAnimation(); }),
      rxjs.operators.delay(animationDelayByBrowser), // HACK: Delay data somewhat so browser gives priority to DOM manipulation instead of initiating all further streams.
      rxjs.operators.flatMap(R.curry(SessionData.mkSessionDataStream)(nacl)), // TODO: Remove global dependency
      rxjs.operators.tap(updateUserCrypto),
      rxjs.operators.flatMap(AssetInitialisation.mkAssetInitializationStream),
      rxjs.operators.map(R.sortBy(R.compose(R.toLower, R.prop('id')))),
      rxjs.operators.tap(U.updateGlobalAssets)
    )
    .subscribe(renderInterface);
}

function renderInterface (assets) {
  fetchview('interface');
}

// TODO: mk into Stream
function handleCtrlSKeyEvent (e) {
  var possible = [ e.key, e.keyIdentifier, e.keyCode, e.which ];

  while (R.isNil(key) && possible.length > 0) {
    key = possible.pop();
  }

  if (key && (key === '115' || key === '83') && (e.ctrlKey || e.metaKey) && !(e.altKey)) {
    e.preventDefault();
    document.querySelector('#loginbutton').removeAttribute('disabled');
    return false;
  }
  return true;
}

function maybeOpenNewWalletModal (location) {
  if (location.href.indexOf('#') !== -1) {
    var locationHref = location.href.substr(location.href.indexOf('#'));
    if (locationHref === '#new') {
      PRNG.seeder.restart(); // As found in: newaccount_b.js
      document.getElementById('newaccountmodal').style.display = 'block';
    }
  }
}

function updateUserCrypto (userSessionData) {
  GL.usercrypto = {
    user_keys: R.nth(0, userSessionData),
    nonce: R.path(['3', 'current_nonce'], userSessionData),
    userid: R.path(['2', 'userID'], userSessionData)
  };
}

U.documentReady(main);
