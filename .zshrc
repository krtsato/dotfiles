#!/usr/local/bin/zsh

# zsh $PROMPT | default : PROMPT=%m%#
autoload -Uz colors && colors
PROMPT="%{$fg[green]%}%1~ %# %{$reset_color%}"

# zsh-completions
autoload -Uz compinit && compinit -u
fpath=(/usr/local/share/zsh-completions $fpath)
## match dotfiles without '.' in a completion
setopt GLOB_DOTS

# zsh coloring
## for directories, symbolic links, executable files
export LSCOLORS=cxgxxxxxfxxxxxxxxxxxxx
## for completions
zstyle ':completion:*' list-colors di=32 ln=36 ex=35$ source ~/.zshrc

# my shell scripts
export PATH=/Users/satoshi/shells:$PATH

# openssl installed by homebrew, not default version
export PATH=/usr/local/opt/openssl/bin:$PATH

# hyper-tab-icons-plus
precmd() {
   pwd=$(pwd)
   cwd=${pwd##*/}
   print -Pn "\e]0;$cwd\a"
}

preexec() {
   printf "\033]0;%s\a" "${1%% *} | $cwd"
}

# golang
## for executable binary, such as go, godoc and gofmt
GOROOT=$(go env GOROOT)
export PATH=$GOROOT/bin:$PATH

## for external go packages
GOPATH=$(go env GOPATH)
export PATH=$GOPATH/bin:$PATH
export GOPROXY=direct
export GOSUMDB=off

## for modules
export GO111MODULE=on

# Ruby
export PATH=/usr/local/opt/ruby/bin:$PATH

# Serverless Framework
# tabtab source for packages
# uninstall by removing these lines
[[ -f ~/.config/tabtab/__tabtab.zsh ]] && . ~/.config/tabtab/__tabtab.zsh || true
