#!/bin/sh
OLDPATH=$PATH
# $HYBRIDD/$NODE/scripts/npm  => $HYBRIDD

SCRIPTDIR="`dirname \"$0\"`"
HYBRIDD="`cd \"$SCRIPTDIR/../../..\" && pwd`"

INTERFACE="$HYBRIDD/interface"
NODE="$HYBRIDD/node"
DETERMINISTIC="$HYBRIDD/deterministic"
NODEJS="$HYBRIDD/nodejs-v8-lts"
COMMON="$HYBRIDD/common"
INTERFACE="$HYBRIDD/interface"
WEB_WALLET="$HYBRIDD/web-wallet"

if [ "`uname`" = "Darwin" ]; then
    SYSTEM="darwin-x64"
elif [ "`uname -m`" = "i386" ] || [ "`uname -m`" = "i686" ]; then
    SYSTEM="x86"
elif [ "`uname -m`" = "x86_64" ]; then
    SYSTEM="x86_64"
else
    echo "[!] Unknown Architecture (or incomplete implementation)"
    exit 1;
fi

export PATH="$NODEJS/$SYSTEM/bin:$PATH"


# NODE
if [ ! -e "$INTERFACE/node" ];then

    echo " [!] interface/node not found."

    if [ ! -e "$NODEJS" ];then
        cd "$HYBRIDD"
        echo " [i] Clone node js runtimes files"
        git clone https://github.com/internetofcoins/nodejs-v8-lts.git
    fi
    echo " [i] Link NODEJS files"
    ln -sf "$NODEJS/$SYSTEM" "$INTERFACE/node"
fi

# COMMON
if [ ! -e "$INTERFACE/common" ];then

    echo " [!] interface/common not found."

    if [ ! -e "$COMMON" ];then
        cd "$HYBRIDD"
        echo " [i] Clone common files"
        git clone https://www.gitlab.com/iochq/hybridd/common.git
    fi
    echo " [i] Link common files"
    ln -sf "$COMMON" "$INTERFACE/common"

fi

# INTERFACE
if [ ! -e "$NODE/interface" ];then

    echo " [!] node/interface not found."

    if [ ! -e "$INTERFACE" ];then
        cd "$HYBRIDD"
        echo " [i] Clone interface files"
        git clone https://www.gitlab.com/iochq/hybridd/interface.git
    fi
    echo " [i] Link interface files"
    ln -sf "$INTERFACE" "$NODE/interface"
fi


# DETERMINISTIC CLIENT MODULES
if [ -e "$DETERMINISTIC" ];then
    cd "$DETERMINISTIC/modules/"
    echo " [i] Build and copy determinstic client modules"
    sh "$DETERMINISTIC/scripts/npm/build.sh"
fi

# Generate libary that can be imported into Node projects
$INTERFACE/node_modules/webpack/bin/webpack.js --config "$INTERFACE/conf/webpack.config.hybridd.interface.nodejs.js"

# Generate libary that can be imported into html pages
$INTERFACE/node_modules/uglify-es/bin/uglifyjs "$INTERFACE/common/crypto/nacl.js" > "$INTERFACE/dist/hybridd.interface.nacl.js.tmp"

$INTERFACE/node_modules/webpack/bin/webpack.js -p --config "$INTERFACE/conf/webpack.config.hybridd.interface.web.js"
$INTERFACE/node_modules/uglify-es/bin/uglifyjs "$INTERFACE/dist/hybridd.interface.web.js.tmp" > "$INTERFACE/dist/hybridd.interface.web.js.min.tmp"

# fuse the packed files together
cat "$INTERFACE/dist/hybridd.interface.nacl.js.tmp" "$INTERFACE/dist/hybridd.interface.web.js.min.tmp"  > "$INTERFACE/dist/hybridd.interface.web.js"

# clean up
rm "$INTERFACE/dist/hybridd.interface.nacl.js.tmp"
rm "$INTERFACE/dist/hybridd.interface.web.js.tmp"
rm "$INTERFACE/dist/hybridd.interface.web.js.min.tmp"

PATH=$OLDPATH
