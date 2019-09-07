#!/bin/bash
VERSION=$(git describe --tags --abbrev=0)
docker build -t "dolittle/asana-risk-plugin:$VERSION" .
docker push "dolittle/asana-risk-plugin:$VERSION"