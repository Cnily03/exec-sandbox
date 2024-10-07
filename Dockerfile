FROM ubuntu:22.04

# Install bun
RUN curl -fsSL https://bun.sh/install | bash

# Copy files
USER root
COPY . /root/app

# Install dependencies
WORKDIR /root/app
RUN bun install

# Run the app
USER root
ENTRYPOINT [ "/root/.bun/bin/bun" ]
CMD ["start"]

# Expose the port
EXPOSE 3000
