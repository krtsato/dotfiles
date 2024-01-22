# ------------------------------------------------------------ #
# Fig pre block. Keep at the top of this file.
# ------------------------------------------------------------ #

[[ -f "$HOME/.fig/shell/zshrc.pre.zsh" ]] && builtin source "$HOME/.fig/shell/zshrc.pre.zsh"

#!/opt/homebrew/bin/zsh
# old shebang
#!/usr/local/bin/zsh

# ------------------------------------------------------------ #
# Brew
# ------------------------------------------------------------ #

export PATH=/opt/homebrew/bin:$PATH

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
# old path
# fpath=(/usr/local/share/zsh-completions $fpath)
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
ssh-add --apple-use-keychain "$HOME/.ssh/id_ed25519_github.com_red"
ssh -T git@github.com
ssh -T git@github.com.red

# ------------------------------------------------------------ #
# Starship
# ------------------------------------------------------------ #

eval "$(starship init zsh)"
export STARSHIP_CONFIG=~/engr/me/dotfiles/.starship.toml

# ------------------------------------------------------------ #
# OpenSSL
# ------------------------------------------------------------ #

# openssl installed by homebrew, not default version

# old path
# export PATH=/usr/local/opt/openssl/bin:$PATH
export PATH=/opt/homebrew/bin/openssl/bin:$PATH

# ------------------------------------------------------------ #
# Shell
# ------------------------------------------------------------ #

# my shell scripts
export PATH=~/engr/me/shells:$PATH

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
# AWS
# ------------------------------------------------------------ #
export AWS_PROFILE=awa

# ------------------------------------------------------------ #
# Google Cloud SDK
# ------------------------------------------------------------ #

# The next line updates PATH for the Google Cloud SDK.
# old path
# [ -f '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc' ] && . '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc'
[ -f '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc' ] && . '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc'

# The next line enables shell command completion for gcloud.
# old path
# [ -f '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc' ] && . '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc'
[ -f '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc' ] && . '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc'

# ------------------------------------------------------------ #
# Node
# ------------------------------------------------------------ #

export NVM_DIR=~/.nvm
export NVM_SYMLINK_CURRENT=true
# old path
# [ -s "/usr/local/opt/nvm/nvm.sh" ] && . "/usr/local/opt/nvm/nvm.sh"
# [ -s "/usr/local/opt/nvm/etc/bash_completion.d/nvm" ] && . "/usr/local/opt/nvm/etc/bash_completion.d/nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && . "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
[ -e ".nvmrc" ] && nvm use

# ------------------------------------------------------------ #
# Java
# ------------------------------------------------------------ #

export PATH=/opt/homebrew/opt/openjdk/bin:$PATH
export CPPFLAGS=-I/opt/homebrew/opt/openjdk/include

# ------------------------------------------------------------ #
# Xcode
# ------------------------------------------------------------ #

export PATH=/usr/bin/xcrun:$PATH

# ------------------------------------------------------------ #
# MongoDB
# ------------------------------------------------------------ #

export PATH=/opt/homebrew/opt/mongodb-community-shell@4.4/bin:$PATH
export PATH=/opt/homebrew/opt/mongodb-community/bin:$PATH

# ------------------------------------------------------------ #
# Fig
# ------------------------------------------------------------ #

export PATH=~/.local/bin:$PATH

# Fig post block. Keep at the bottom of this file.
[[ -f "$HOME/.fig/shell/zshrc.post.zsh" ]] && builtin source "$HOME/.fig/shell/zshrc.post.zsh"
