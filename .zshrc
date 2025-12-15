# ------------------------------------------------------------ #
# Kiro CLI pre block. Keep at the top of this file.
# ------------------------------------------------------------ #

[[ -f "${HOME}/Library/Application Support/kiro-cli/shell/zshrc.pre.zsh" ]] && builtin source "${HOME}/Library/Application Support/kiro-cli/shell/zshrc.pre.zsh"

#!/opt/homebrew/bin/zsh

# ------------------------------------------------------------ #
# Variables
# ------------------------------------------------------------ #
DIR_DEV=$HOME/dev

# ------------------------------------------------------------ #
# Brew
# ------------------------------------------------------------ #

export PATH=/opt/homebrew/bin:$PATH

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
autoload -Uz compinit && compinit -u
fpath=(/opt/homebrew/share/zsh-completions $fpath)

# match dotfiles without '.' in a completion
setopt GLOB_DOTS

# coloring for directories, symbolic links, executable files
export LSCOLORS=cxgxxxxxfxxxxxxxxxxxxx
# coloring for completions
zstyle ':completion:*' list-colors di=32 ln=36 ex=35$ source ~/.zshrc

# ------------------------------------------------------------ #
# SSH
# ------------------------------------------------------------ #

eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain "$HOME/.ssh/id_ecdsa_github.com"
ssh -T git@github.com

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

# ------------------------------------------------------------ #
# Kiro CLI post block. Keep at the bottom of this file.
# ------------------------------------------------------------ #

[[ -f "${HOME}/Library/Application Support/kiro-cli/shell/zshrc.post.zsh" ]] && builtin source "${HOME}/Library/Application Support/kiro-cli/shell/zshrc.post.zsh"
