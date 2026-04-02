sudo apt update && sudo apt upgrade -y

sudo apt install -y libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev


curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

source $HOME/.cargo/env


# 1. Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# 2. Refresh your terminal again so NVM works
source ~/.bashrc

# 3. Install the latest version of Node.js
nvm install node

# 4. Install PNPM globally
npm install -g pnpm




# 2. Enter the folder
cd TestingTauri
# 3. Install the JavaScript frontend dependencies
pnpm install
# 4. Build the final application!
pnpm tauri build



./src-tauri/target/release/tauri-tanstack-start-react-template



--
# For downloadable file

wget https://github.com/hamiltonnBC/timeline-app_0.1.0_arm64.deb
sudo dpkg -i timeline-app_0.1.0_arm64.deb
timeline-app
