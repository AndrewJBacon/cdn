/**
 * EasyStar.js
 * github.com/prettymuchbryce/EasyStarJS
 * Licensed under the MIT license.
 *
 * Implementation By Bryce Neal (@prettymuchbryce)
 **/

class EasyStar {
  constructor() {
    this.STRAIGHT_COST = 1.0;
    this.DIAGONAL_COST = 1.4;
    this.pointsToAvoid = {};
    this.collisionGrid;
    this.costMap = {};
    this.pointsToCost = {};
    this.directionalConditions = {};
    this.allowCornerCutting = true;
    this.avoidAdditionalPoint = false;
    this.iterationsSoFar;
    this.instances = {};
    this.instanceQueue = [];
    this.iterationsPerCalculation = Number.MAX_VALUE;
    this.diagonalsEnabled = false;
  }

  setAcceptableTiles(tiles) {
    if (tiles instanceof Array) {
      this.acceptableTiles = tiles;
    } else if (!isNaN(parseFloat(tiles)) && isFinite(tiles)) {
      this.acceptableTiles = [tiles];
    }
  }

  enableSync() {
    this.syncEnabled = true;
  }

  disableSync() {
    this.syncEnabled = false;
  }

  enableDiagonals() {
    this.diagonalsEnabled = true;
  }

  disableDiagonals() {
    this.diagonalsEnabled = false;
  }

  setGrid(grid) {
    this.collisionGrid = grid;

    for (let y = 0; y < this.collisionGrid.length; y++) {
      for (let x = 0; x < this.collisionGrid[0].length; x++) {
        if (!this.costMap[this.collisionGrid[y][x]]) {
          this.costMap[this.collisionGrid[y][x]] = 1;
        }
      }
    }
  }

  setTileCost(tileType, cost) {
    this.costMap[tileType] = cost;
  }

  setAdditionalPointCost(x, y, cost) {
    if (this.pointsToCost[y] === undefined) {
      this.pointsToCost[y] = {};
    }
    this.pointsToCost[y][x] = cost;
  }

  removeAdditionalPointCost(x, y) {
    if (this.pointsToCost[y] !== undefined) {
      delete this.pointsToCost[y][x];
    }
  }

  removeAllAdditionalPointCosts() {
    this.pointsToCost = {};
  }

  setDirectionalCondition(x, y, allowedDirections) {
    if (this.directionalConditions[y] === undefined) {
      this.directionalConditions[y] = {};
    }
    this.directionalConditions[y][x] = allowedDirections;
  }

  removeAllDirectionalConditions() {
    this.directionalConditions = {};
  }

  setIterationsPerCalculation(iterations) {
    this.iterationsPerCalculation = iterations;
  }

  avoidAdditionalPoint(x, y) {
    if (this.pointsToAvoid[y] === undefined) {
      this.pointsToAvoid[y] = {};
    }
    this.pointsToAvoid[y][x] = 1;
  }

  stopAvoidingAdditionalPoint(x, y) {
    if (this.pointsToAvoid[y] !== undefined) {
      delete this.pointsToAvoid[y][x];
    }
  }

  enableCornerCutting() {
    this.allowCornerCutting = true;
  }

  disableCornerCutting() {
    this.allowCornerCutting = false;
  }

  stopAvoidingAllAdditionalPoints() {
    this.pointsToAvoid = {};
  }

  findPath(startX, startY, endX, endY, callback) {
    // Wraps the callback for sync vs async logic
    const callbackWrapper = (result) => {
      if (this.syncEnabled) {
        callback(result);
      } else {
        setTimeout(() => {
          callback(result);
        });
      }
    };

    // No acceptable tiles were set
    if (this.acceptableTiles === undefined) {
      throw new Error(
        "You can't set a path without first calling setAcceptableTiles() on EasyStar."
      );
    }

    // No grid was set
    if (this.collisionGrid === undefined) {
      throw new Error(
        "You can't set a path without first calling setGrid() on EasyStar."
      );
    }

    // Start or endpoint outside of scope.
    if (
      startX < 0 ||
      startY < 0 ||
      endX < 0 ||
      endY < 0 ||
      startX > this.collisionGrid[0].length - 1 ||
      startY > this.collisionGrid.length - 1 ||
      endX > this.collisionGrid[0].length - 1 ||
      endY > this.collisionGrid.length - 1
    ) {
      throw new Error(
        "Your start or end point is outside the scope of your grid."
      );
    }

    // Start and end are the same tile.
    if (startX === endX && startY === endY) {
      callbackWrapper([]);
      return;
    }

    // End point is not an acceptable tile.
    const endTile = this.collisionGrid[endY][endX];
    let isAcceptable = false;
    for (let i = 0; i < this.acceptableTiles.length; i++) {
      if (endTile === this.acceptableTiles[i]) {
        isAcceptable = true;
        break;
      }
    }

    if (!isAcceptable) {
      callbackWrapper(null);
      return;
    }

    // Create the instance
    const instance = new Instance();
    instance.openList = new Heap(
      (nodeA, nodeB) => nodeA.bestGuessDistance() - nodeB.bestGuessDistance()
    );
    instance.isDoneCalculating = false;
    instance.nodeHash = {};
    instance.startX = startX;
    instance.startY = startY;
    instance.endX = endX;
    instance.endY = endY;
    instance.callback = callbackWrapper;

    instance.openList.push(
      this.coordinateToNode(
        instance,
        instance.startX,
        instance.startY,
        null,
        this.STRAIGHT_COST
      )
    );

    const instanceId = nextInstanceId++;
    this.instances[instanceId] = instance;
    this.instanceQueue.push(instanceId);
    return instanceId;
  }

  cancelPath(instanceId) {
    if (instanceId in this.instances) {
      delete this.instances[instanceId];
      // No need to remove it from instanceQueue
      return true;
    }
    return false;
  }

  calculate() {
    if (
      this.instanceQueue.length === 0 ||
      this.collisionGrid === undefined ||
      this.acceptableTiles === undefined
    ) {
      return;
    }
    for (
      this.iterationsSoFar = 0;
      this.iterationsSoFar < this.iterationsPerCalculation;
      this.iterationsSoFar++
    ) {
      if (this.instanceQueue.length === 0) {
        return;
      }
      if (this.syncEnabled) {
        // If this is a sync instance, we want to make sure that it calculates synchronously.
        this.iterationsSoFar = 0;
      }

      const instanceId = this.instanceQueue[0];
      const instance = this.instances[instanceId];
      if (typeof instance === "undefined") {
        // This instance was cancelled
        this.instanceQueue.shift();
        continue;
      }

      // Couldn't find a path.
      if (instance.openList.size() === 0) {
        instance.callback(null);
        delete this.instances[instanceId];
        this.instanceQueue.shift();
        continue;
      }

      const searchNode = instance.openList.pop();

      // Handles the case where we have found the destination
      if (instance.endX === searchNode.x && instance.endY === searchNode.y) {
        const path = [];
        path.push({ x: searchNode.x, y: searchNode.y });
        let parent = searchNode.parent;
        while (parent != null) {
          path.push({ x: parent.x, y: parent.y });
          parent = parent.parent;
        }
        path.reverse();
        instance.callback(path);
        delete this.instances[instanceId];
        this.instanceQueue.shift();
        continue;
      }

      searchNode.list = CLOSED_LIST;

      if (searchNode.y > 0) {
        this.checkAdjacentNode(
          instance,
          searchNode,
          0,
          -1,
          this.STRAIGHT_COST * this.getTileCost(searchNode.x, searchNode.y - 1)
        );
      }
      if (searchNode.x < this.collisionGrid[0].length - 1) {
        this.checkAdjacentNode(
          instance,
          searchNode,
          1,
          0,
          this.STRAIGHT_COST * this.getTileCost(searchNode.x + 1, searchNode.y)
        );
      }
      if (searchNode.y < this.collisionGrid.length - 1) {
        this.checkAdjacentNode(
          instance,
          searchNode,
          0,
          1,
          this.STRAIGHT_COST * this.getTileCost(searchNode.x, searchNode.y + 1)
        );
      }
      if (searchNode.x > 0) {
        this.checkAdjacentNode(
          instance,
          searchNode,
          -1,
          0,
          this.STRAIGHT_COST * this.getTileCost(searchNode.x - 1, searchNode.y)
        );
      }

      if (this.diagonalsEnabled) {
        if (searchNode.x > 0 && searchNode.y > 0) {
          if (
            this.allowCornerCutting ||
            (this.isTileWalkable(
              this.collisionGrid,
              this.acceptableTiles,
              searchNode.x,
              searchNode.y - 1,
              searchNode
            ) &&
              this.isTileWalkable(
                this.collisionGrid,
                this.acceptableTiles,
                searchNode.x - 1,
                searchNode.y,
                searchNode
              ))
          ) {
            this.checkAdjacentNode(
              instance,
              searchNode,
              -1,
              -1,
              this.DIAGONAL_COST *
                this.getTileCost(searchNode.x - 1, searchNode.y - 1)
            );
          }
        }
        if (
          searchNode.x < this.collisionGrid[0].length - 1 &&
          searchNode.y < this.collisionGrid.length - 1
        ) {
          if (
            this.allowCornerCutting ||
            (this.isTileWalkable(
              this.collisionGrid,
              this.acceptableTiles,
              searchNode.x,
              searchNode.y + 1,
              searchNode
            ) &&
              this.isTileWalkable(
                this.collisionGrid,
                this.acceptableTiles,
                searchNode.x + 1,
                searchNode.y,
                searchNode
              ))
          ) {
            this.checkAdjacentNode(
              instance,
              searchNode,
              1,
              1,
              this.DIAGONAL_COST *
                this.getTileCost(searchNode.x + 1, searchNode.y + 1)
            );
          }
        }
        if (
          searchNode.x < this.collisionGrid[0].length - 1 &&
          searchNode.y > 0
        ) {
          if (
            this.allowCornerCutting ||
            (this.isTileWalkable(
              this.collisionGrid,
              this.acceptableTiles,
              searchNode.x,
              searchNode.y - 1,
              searchNode
            ) &&
              this.isTileWalkable(
                this.collisionGrid,
                this.acceptableTiles,
                searchNode.x + 1,
                searchNode.y,
                searchNode
              ))
          ) {
            this.checkAdjacentNode(
              instance,
              searchNode,
              1,
              -1,
              this.DIAGONAL_COST *
                this.getTileCost(searchNode.x + 1, searchNode.y - 1)
            );
          }
        }
        if (searchNode.x > 0 && searchNode.y < this.collisionGrid.length - 1) {
          if (
            this.allowCornerCutting ||
            (this.isTileWalkable(
              this.collisionGrid,
              this.acceptableTiles,
              searchNode.x,
              searchNode.y + 1,
              searchNode
            ) &&
              this.isTileWalkable(
                this.collisionGrid,
                this.acceptableTiles,
                searchNode.x - 1,
                searchNode.y,
                searchNode
              ))
          ) {
            this.checkAdjacentNode(
              instance,
              searchNode,
              -1,
              1,
              this.DIAGONAL_COST *
                this.getTileCost(searchNode.x - 1, searchNode.y + 1)
            );
          }
        }
      }
    }
  }

  checkAdjacentNode(instance, searchNode, x, y, cost) {
    const adjacentCoordinateX = searchNode.x + x;
    const adjacentCoordinateY = searchNode.y + y;

    if (
      (this.pointsToAvoid[adjacentCoordinateY] === undefined ||
        this.pointsToAvoid[adjacentCoordinateY][adjacentCoordinateX] ===
          undefined) &&
      this.isTileWalkable(
        this.collisionGrid,
        this.acceptableTiles,
        adjacentCoordinateX,
        adjacentCoordinateY,
        searchNode
      )
    ) {
      const node = this.coordinateToNode(
        instance,
        adjacentCoordinateX,
        adjacentCoordinateY,
        searchNode,
        cost
      );

      if (node.list === undefined) {
        node.list = OPEN_LIST;
        instance.openList.push(node);
      } else if (searchNode.costSoFar + cost < node.costSoFar) {
        node.costSoFar = searchNode.costSoFar + cost;
        node.parent = searchNode;
        instance.openList.updateItem(node);
      }
    }
  }

  isTileWalkable(collisionGrid, acceptableTiles, x, y, sourceNode) {
    const directionalCondition =
      this.directionalConditions[y] && this.directionalConditions[y][x];
    if (directionalCondition) {
      const direction = this.calculateDirection(
        sourceNode.x - x,
        sourceNode.y - y
      );
      const directionIncluded = () => {
        for (let i = 0; i < directionalCondition.length; i++) {
          if (directionalCondition[i] === direction) return true;
        }
        return false;
      };
      if (!directionIncluded()) return false;
    }

    for (let i = 0; i < acceptableTiles.length; i++) {
      if (collisionGrid[y][x] === acceptableTiles[i]) {
        return true;
      }
    }

    return false;
  }

  calculateDirection(diffX, diffY) {
    if (diffX === 0 && diffY === -1) return EasyStar.TOP;
    else if (diffX === 1 && diffY === -1) return EasyStar.TOP_RIGHT;
    else if (diffX === 1 && diffY === 0) return EasyStar.RIGHT;
    else if (diffX === 1 && diffY === 1) return EasyStar.BOTTOM_RIGHT;
    else if (diffX === 0 && diffY === 1) return EasyStar.BOTTOM;
    else if (diffX === -1 && diffY === 1) return EasyStar.BOTTOM_LEFT;
    else if (diffX === -1 && diffY === 0) return EasyStar.LEFT;
    else if (diffX === -1 && diffY === -1) return EasyStar.TOP_LEFT;
    throw new Error("These differences are not valid: " + diffX + ", " + diffY);
  }

  getTileCost(x, y) {
    return (
      (this.pointsToCost[y] && this.pointsToCost[y][x]) ||
      this.costMap[this.collisionGrid[y][x]]
    );
  }

  coordinateToNode(instance, x, y, parent, cost) {
    if (instance.nodeHash[y] !== undefined) {
      if (instance.nodeHash[y][x] !== undefined) {
        return instance.nodeHash[y][x];
      }
    } else {
      instance.nodeHash[y] = {};
    }
    var simpleDistanceToTarget = this.getDistance(
      x,
      y,
      instance.endX,
      instance.endY
    );
    if (parent !== null) {
      var costSoFar = parent.costSoFar + cost;
    } else {
      costSoFar = 0;
    }
    var node = new Node(parent, x, y, costSoFar, simpleDistanceToTarget);
    instance.nodeHash[y][x] = node;
    return node;
  }

  getDistance(x1, y1, x2, y2) {
    if (this.diagonalsEnabled) {
      // Octile distance
      var dx = Math.abs(x1 - x2);
      var dy = Math.abs(y1 - y2);
      if (dx < dy) {
        return this.DIAGONAL_COST * dx + dy;
      } else {
        return this.DIAGONAL_COST * dy + dx;
      }
    } else {
      // Manhattan distance
      var dx = Math.abs(x1 - x2);
      var dy = Math.abs(y1 - y2);
      return dx + dy;
    }
  }
}

EasyStar.TOP = "TOP";
EasyStar.TOP_RIGHT = "TOP_RIGHT";
EasyStar.RIGHT = "RIGHT";
EasyStar.BOTTOM_RIGHT = "BOTTOM_RIGHT";
EasyStar.BOTTOM = "BOTTOM";
EasyStar.BOTTOM_LEFT = "BOTTOM_LEFT";
EasyStar.LEFT = "LEFT";
EasyStar.TOP_LEFT = "TOP_LEFT";

export default EasyStar;
