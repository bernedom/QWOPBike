{
  description = "LarsBike - a small React/web game";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            pnpm
            typescript
            typescript-language-server
            vscode-langservers-extracted # html/css/json/eslint language servers
            prettierd
          ];

          shellHook = ''
            echo "LarsBike dev shell: node $(node --version), pnpm $(pnpm --version)"
          '';
        };

        formatter = pkgs.nixfmt-rfc-style;
      }
    );
}
