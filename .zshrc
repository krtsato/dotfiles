#!/usr/local/bin/zsh

# ------------------------------------------------------------ #
# Zsh
# ------------------------------------------------------------ #

# avoid path duplication
typeset -U path PATH

# zsh $PROMPT | default : PROMPT=%m%#
autoload -Uz colors && colors
PROMPT="%{$fg[green]%}%1~ %# %{$reset_color%}"

# zsh-completions
autoload -Uz compinit && compinit -u
fpath=(/usr/local/share/zsh-completions $fpath)
# match dotfiles without '.' in a completion
setopt GLOB_DOTS

# coloring for directories, symbolic links, executable files
export LSCOLORS=cxgxxxxxfxxxxxxxxxxxxx
# coloring for completions
zstyle ':completion:*' list-colors di=32 ln=36 ex=35$ source ~/.zshrc

# ------------------------------------------------------------ #
# Hyper
# ------------------------------------------------------------ #

# hyper-tab-icons-plus
precmd() {
   pwd=$(pwd)
   cwd=${pwd##*/}
   print -Pn "\e]0;$cwd\a"
}
preexec() {
   printf "\033]0;%s\a" "${1%% *} | $cwd"
}

# ------------------------------------------------------------ #
# OpenSSL
# ------------------------------------------------------------ #

# openssl installed by homebrew, not default version
export PATH=/usr/local/opt/openssl/bin:$PATH

# ------------------------------------------------------------ #
# Shell
# ------------------------------------------------------------ #

# my shell scripts
export PATH=$HOME/shells:$PATH

# ------------------------------------------------------------ #
# Java
# ------------------------------------------------------------ #

# version
export JAVA_HOME=$(/usr/libexec/java_home -v 1.8)

# OpenJDK
export PATH=/usr/local/opt/openjdk/bin:$PATH
export CPPFLAGS=-I/usr/local/opt/openjdk/include

# ------------------------------------------------------------ #
# Golang
# ------------------------------------------------------------ #

# executable binary, such as go, godoc and gofmt
GOROOT=$(go env GOROOT)
export PATH=$GOROOT/bin:$PATH

# external go packages
GOPATH=$(go env GOPATH)
export PATH=$GOPATH/bin:$PATH
export GOPROXY=direct
export GOSUMDB=off

# for modules
export GO111MODULE=on

# ------------------------------------------------------------ #
# Ruby
# ------------------------------------------------------------ #

export PATH=/usr/local/opt/ruby/bin:$PATH

# ------------------------------------------------------------ #
# Node
# ------------------------------------------------------------ #

export PATH=/usr/local/opt/node@14/bin:$PATH
export LDFLAGS=-L/usr/local/opt/node@14/lib
export CPPFLAGS=-I/usr/local/opt/node@14/include

# ------------------------------------------------------------ #
# Serverless Framework
# ------------------------------------------------------------ #

# tabtab source for packages. uninstall by removing these lines
[[ -f ~/.config/tabtab/__tabtab.zsh ]] && . ~/.config/tabtab/__tabtab.zsh || true

# ------------------------------------------------------------ #
# Job Tools
# ------------------------------------------------------------ #

export PATH=/usr/local/opt/swig@3/bin:$PATH
