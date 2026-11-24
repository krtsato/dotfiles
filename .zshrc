#!/opt/homebrew/bin/zsh

# ------------------------------------------------------------ #
# Variables
# ------------------------------------------------------------ #
DIR_DEV=$HOME/dev

# ------------------------------------------------------------ #
# Brew
# ------------------------------------------------------------ #

export PATH=/opt/homebrew/bin:$PATH
export PATH=/opt/homebrew/sbin:$PATH

# ------------------------------------------------------------ #
# Docker
# ------------------------------------------------------------ #

export PATH="$HOME/.docker/bin:$PATH"

# ------------------------------------------------------------ #
# mise
# ------------------------------------------------------------ #

eval "$(mise activate zsh)"

# ------------------------------------------------------------ #
# Zsh
# ------------------------------------------------------------ #

# avoid path duplication
typeset -U path PATH

# zsh $PROMPT | default : PROMPT=%m%#
autoload -Uz colors && colors
PROMPT="%{$fg[green]%}%1~ %# %{$reset_color%}"

# zsh-completions
fpath=(/opt/homebrew/share/zsh-completions $fpath)
autoload -Uz compinit
# Rebuild the completion dump at most once a day; otherwise load it without the slow security check
zcompdump_stale=(${ZDOTDIR:-$HOME}/.zcompdump(N.mh+24))
if (( $#zcompdump_stale )) || [[ ! -s ${ZDOTDIR:-$HOME}/.zcompdump ]]; then
  compinit -u && touch ${ZDOTDIR:-$HOME}/.zcompdump
else
  compinit -C
fi
unset zcompdump_stale

# match dotfiles without '.' in a completion
setopt GLOB_DOTS

# coloring for directories, symbolic links, executable files
export LSCOLORS=cxgxxxxxfxxxxxxxxxxxxx
# coloring for completions
zstyle ':completion:*' list-colors di=32 ln=36 ex=35

# ------------------------------------------------------------ #
# Starship
# ------------------------------------------------------------ #

eval "$(starship init zsh)"
export STARSHIP_CONFIG=$DIR_DEV/me/dotfiles/.starship.toml

# ------------------------------------------------------------ #
# Shell
# ------------------------------------------------------------ #

# my shell scripts
export PATH=$DIR_DEV/me/shells:$PATH

# ------------------------------------------------------------ #
# Golang
# ------------------------------------------------------------ #

# executable binary, such as go, godoc and gofmt
GOROOT=$(go env GOROOT)
export PATH=$GOROOT/bin:$PATH

# external go packages
GOPATH=$(go env GOPATH)
export PATH=$GOPATH/bin:$PATH
export GOPROXY="https://proxy.golang.org,direct"
export GOSUMDB=off

# for modules
export GO111MODULE=on

# ------------------------------------------------------------ #
# AWS
# ------------------------------------------------------------ #
export AWS_PROFILE=default

# ------------------------------------------------------------ #
# NotebookLM (nlm)
# ------------------------------------------------------------ #
# Hand-run nlm uses the same storage as the nightly pipeline
# (krtsato/mcp-notebooklm passes this path too), so one login serves both.
export NOTEBOOKLM_MCP_CLI_PATH="$HOME/.config/mcp-notebooklm/nlm"

# ------------------------------------------------------------ #
# Google Cloud SDK
# ------------------------------------------------------------ #

# The next line updates PATH for the Google Cloud SDK and gcloud command
[ -f '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc' ] && . '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc'
[ -f '/opt/homebrew/share/google-cloud-sdk/path.zsh.inc' ] && . '/opt/homebrew/share/google-cloud-sdk/path.zsh.inc'

# The next line enables shell command completion for gcloud.
[ -f '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc' ] && . '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc'
[ -f '/opt/homebrew/share/google-cloud-sdk/completion.zsh.inc' ] && . '/opt/homebrew/share/google-cloud-sdk/completion.zsh.inc'

# ------------------------------------------------------------ #
# Node
# ------------------------------------------------------------ #

# TODO

# ------------------------------------------------------------ #
# Java
# ------------------------------------------------------------ #

# TODO

# ------------------------------------------------------------ #
# Xcode
# ------------------------------------------------------------ #

export PATH=/usr/bin/xcrun:$PATH

# ------------------------------------------------------------ #
# MongoDB
# ------------------------------------------------------------ #

# TODO

# ------------------------------------------------------------ #
# Python
# ------------------------------------------------------------ #

# TODO

# ------------------------------------------------------------ #
# ngrok
# ------------------------------------------------------------ #

if command -v ngrok &>/dev/null; then
    eval "$(ngrok completion)"
fi
