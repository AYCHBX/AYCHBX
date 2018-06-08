clipboard = {
  clipboardSuccess: function () {
    Rx.Observable.of(false)
      .delay(1200)
      .startWith(true)
      .subscribe(function (isActive) {
        document.querySelector('#action-receive .copied').classList.toggle('active', isActive);
      });
  },
  clipboardError: function () {
    alert('This browser cannot automatically copy to the clipboard! \n\nPlease select the text manually, and press CTRL+C to \ncopy it to your clipboard.\n');
  }
};
