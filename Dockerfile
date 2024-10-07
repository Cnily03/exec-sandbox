FROM ubuntu:22.04

USER root

# install tools
RUN apt-get update && apt-get install -y \
    curl \
    git \
    sudo \
    unzip

# Install bun
RUN curl -fsSL https://bun.sh/install | bash

# Copy files
COPY . /root/app

# Install dependencies
WORKDIR /root/app
RUN /root/.bun/bin/bun install

# Run the app
USER root
ENTRYPOINT [ "/root/.bun/bin/bun" ]
CMD ["start"]

# Expose the port
EXPOSE 3000
