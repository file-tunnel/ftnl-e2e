{ pkgs, agentCheck }:
pkgs.mkShell {
  packages = [
    agentCheck
  ]
  ++ (with pkgs; [
    actionlint
    cargo
    git
    jq
    nixfmt
    nodejs_22
    openssl
    pkg-config
    ripgrep
    rustc
    shellcheck
    shfmt
  ]);

  LANG = if pkgs.stdenv.hostPlatform.isDarwin then "en_US.UTF-8" else "C.UTF-8";
  LC_ALL = if pkgs.stdenv.hostPlatform.isDarwin then "en_US.UTF-8" else "C.UTF-8";

  shellHook = ''
    export FTNL_DEV_SHELL="e2e"
    export XDG_CACHE_HOME="''${XDG_CACHE_HOME:-$PWD/.cache/nix-agent}"
  '';
}
