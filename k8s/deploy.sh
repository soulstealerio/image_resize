#! /usr/bin/env bash

set -ex

echo "SET FORCE=1 if you want to delete deployments and recreate"

# Bump patch version
npm version patch --git-tag-version false

export IMAGE_NAME=cblair/imageresize
export IMAGE_VERSION=`cat package.json | jq -r .version`

echo "Deploying $IMAGE_NAME:$IMAGE_VERSION..."

# 1). Build the images:
# * -t is the tag flag, in format name:tag
npm run lint # short circuit lint issues quickly
echo docker build --no-cache --progress=plain -t $IMAGE_NAME:$IMAGE_VERSION .
docker build --no-cache --progress=plain -t $IMAGE_NAME:$IMAGE_VERSION .

# 2). Push to image repo:
echo docker push $IMAGE_NAME:$IMAGE_VERSION
docker push $IMAGE_NAME:$IMAGE_VERSION

# 3). Rollout
# Clean out old stuff if FORCE. Otherwise do an intelligent rollout.
if [[ FORCE -eq 1 ]]; then
  kubectl delete deployment imageresize || true

  # Create k8s and deploy:
  envsubst < ./k8s/deployment.yaml | kubectl create -f -
  envsubst < ./k8s/service.yaml | kubectl create -f - # || true
else
  kubectl set image deployment/imageresize imageresize=$IMAGE_NAME:$IMAGE_VERSION
fi

echo "Done deploying $IMAGE_NAME:$IMAGE_VERSION."
