function resetLoginFlipOverErrorStream (e) {
  return rxjs.of(e)
    .pipe(
      rxjs.operators.tap(resetFlipOverAnimation),
      rxjs.operators.tap(function (_) { setCSSTorenderButtonsToEnabled(); }),
      rxjs.operators.tap(function (_) { toggleLoginSpinner('remove'); }),
      rxjs.operators.tap(function (_) { setLoginButtonText('Sign in'); })
    );
}

// TODO factor up
function resetFlipOverAnimation (e) {
  document.querySelector('.flipper').classList.remove('active'); // FLIP LOGIN FORM BACK
  document.querySelector('#generateform').classList.remove('inactive');
  document.querySelector('#alertbutton').classList.remove('inactive');
  document.querySelector('#helpbutton').classList.remove('inactive');
  document.querySelector('.user-login-notification').classList.add('active');
  document.querySelector('.user-login-notification').innerHTML = R.prop('msg', e);
}

// Eff (dom :: DOM) Error
function notifyUserOfIncorrectCredentials (err) {
  document.querySelector('.user-login-notification').classList.add('active');
  document.querySelector('.user-login-notification').innerHTML = R.prop('msg', err);
}

// TODO: Should move to subscribe?
// Eff (dom :: DOM) Credentials
function disableUserNotificationBox (c) {
  var notificationElement = document.querySelector('.user-login-notification');
  if (notificationElement.classList.contains('active')) {
    notificationElement.classList.remove('active');
    notificationElement.innerHTML = '';
  }
  return c;
}

function toggleLoginSpinner (addOrRemove) {
  document.querySelector('#loginbutton .spinner-loader').classList[addOrRemove]('active');
}

function setCSSTorenderButtonsToEnabled () {
  document.querySelector('#loginbutton').classList.remove('disabled');
  document.querySelector('#generatebutton').removeAttribute('disabled');
  document.querySelector('#helpbutton').removeAttribute('disabled');
}

function setLoginButtonText (str) {
  document.querySelector('#loginwrap').innerHTML = str;
}

function setCSSTorenderButtonsToDisabled () {
  toggleLoginSpinner('add');
  document.querySelector('#loginbutton').classList.add('disabled');
  document.querySelector('#loginwrap').innerHTML = '';
  document.querySelector('#generatebutton').setAttribute('disabled', 'disabled');
  document.querySelector('#helpbutton').setAttribute('disabled', 'disabled');
}

userFeedback = {
  notifyUserOfIncorrectCredentials,
  disableUserNotificationBox,
  toggleLoginSpinner,
  setCSSTorenderButtonsToEnabled,
  setLoginButtonText,
  setCSSTorenderButtonsToDisabled,
  resetFlipOverAnimation
};