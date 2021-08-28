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
# Starship
# ------------------------------------------------------------ #

eval "$(starship init zsh)"
export STARSHIP_CONFIG=~/myrepo/dotfiles/.starship.toml

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
# Google Cloud SDK
# ------------------------------------------------------------ #

# The next line updates PATH for the Google Cloud SDK.
[ -f '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc' ] && . '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc'
# The next line enables shell command completion for gcloud.
[ -f '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc' ] && . '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc'

# ------------------------------------------------------------ #
# Node
# ------------------------------------------------------------ #

export NVM_DIR="$HOME/.nvm"
export NVM_SYMLINK_CURRENT=true
[ -s "/usr/local/opt/nvm/nvm.sh" ] && . "/usr/local/opt/nvm/nvm.sh"
[ -s "/usr/local/opt/nvm/etc/bash_completion.d/nvm" ] && . "/usr/local/opt/nvm/etc/bash_completion.d/nvm"
[ -e ".nvmrc" ] && nvm use
