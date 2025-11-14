class Transform
{
	constructor() {
		this.forward = [0,0,1];
		this.right = [1,0,0];
		this.up = [0,1,0];
	}

	doRotations(RotAngles) {
		this.xRot = [
			[1,0,0,0],
			[0,Math.cos(RotAngles[0]),-1*Math.sin(RotAngles[0]),0],
			[0,Math.sin(RotAngles[0]),Math.cos(RotAngles[0]),0],
			[0,0,0,1],
		];
		this.yRot = [
			[Math.cos(RotAngles[1]),0,Math.sin(RotAngles[1]),0],
			[0,1,0,0],
			[-1*Math.sin(RotAngles[1]),0,Math.cos(RotAngles[1]),0],
			[0,0,0,1],
		];
		this.zRot = [
			[Math.cos(RotAngles[2]),-1*Math.sin(RotAngles[2]),0,0],
			[Math.sin(RotAngles[2]),Math.cos(RotAngles[2]),0,0],
			[0,0,1,0],
			[0,0,0,1],
		];
		//this.forward = this.crossMultiply(xRot,[0,0,1,0]);		
		this.forward = this.crossMultiply(this.zRot,this.crossMultiply(this.yRot,this.crossMultiply(this.xRot,[0,0,1,0])))
		this.right = this.crossMultiply(this.zRot,this.crossMultiply(this.yRot,this.crossMultiply(this.xRot,[1,0,0,0])))
		this.up = this.crossMultiply(this.zRot,this.crossMultiply(this.yRot,this.crossMultiply(this.xRot,[0,1,0,0])))
	}

	crossMultiply(M, V) {
		var temp = [
			M[0][0]*V[0]+M[0][1]*V[1]+M[0][2]*V[2]+M[0][3]*V[3],
			M[1][0]*V[0]+M[1][1]*V[1]+M[1][2]*V[2]+M[1][3]*V[3],
			M[2][0]*V[0]+M[2][1]*V[1]+M[2][2]*V[2]+M[2][3]*V[3],
			M[3][0]*V[0]+M[3][1]*V[1]+M[3][2]*V[2]+M[3][3]*V[3],
		];
		console.log(temp);
		return temp;
	}
}


class GameObject
{
	constructor(loc, rot, scl) {
		this.loc = [...loc]; // Local position offset
		this.rot = [...rot]; // Local rotation offset
		this.scl = [...scl]; // Local scale offset
		this.isTrigger = false;
		this.collisionRadius = 1.0;
		this.velocity = [0,0,0];
		this.angVelocity = [0,0,0];
		this.name = "default";
		this.id = 0;
		this.prefab;
		this.transform = new Transform();
		this.children = [];
		this.updateCounter = 0;
		this.renderCounter = 0;

		// Local offset to apply to each of the object's vertices
		this.mLocalOffset = this.calculateOffset();
	}

	calculateOffset() {
		var mTranslate = math.matrix([
			[1.0, 0.0, 0.0, this.loc[0]],
			[0.0, 1.0, 0.0, this.loc[1]],
			[0.0, 0.0, 1.0, this.loc[2]],
			[0.0, 0.0, 0.0, 1.0],
		]);
		var mRotateX = math.matrix([
			[1.0, 0.0, 0.0, 0.0],
			[0.0, Math.cos(this.rot[0]),-Math.sin(this.rot[0]), 0.0],
			[0.0, Math.sin(this.rot[0]), Math.cos(this.rot[0]), 0.0],
			[0.0, 0.0, 0.0, 1.0],
		]);
		var mRotateY = math.matrix([
			[ Math.cos(this.rot[1]), 0.0, Math.sin(this.rot[1]), 0.0],
			[0.0, 1.0, 0.0, 0.0],
			[-Math.sin(this.rot[1]), 0.0, Math.cos(this.rot[1]), 0.0],
			[0.0, 0.0, 0.0, 1.0],
		]);
		var mRotateZ = math.matrix([
			[Math.cos(this.rot[2]),-Math.sin(this.rot[2]), 0.0, 0.0],
			[Math.sin(this.rot[2]), Math.cos(this.rot[2]), 0.0, 0.0],
			[0.0, 0.0, 1.0, 0.0],
			[0.0, 0.0, 0.0, 1.0],
		]);
		var mScale = math.matrix([
			[this.scl[0], 0.0, 0.0, 0.0],
			[0.0, this.scl[1], 0.0, 0.0],
			[0.0, 0.0, this.scl[2], 0.0],
			[0.0, 0.0, 0.0, 1.0],
		]);
		var mRotate = math.multiply(math.multiply(mRotateZ, mRotateY), mRotateX);
		var ret = math.multiply(mTranslate, math.multiply(mRotate, mScale));
		// var ret = math.multiply(math.multiply(mScale, mRotate), mTranslate);
		// var ret = math.multiply(math.multiply(mTranslate, mRotate), mScale);
		// console.log(ret);
		return ret;
	}

	move() {
		var tempP = [0,0,0]
		for (var i = 0; i < 3; i++) {
			tempP[i] = this.loc[i];
			tempP[i] += this.velocity[i];
			this.rot[i] += this.angVelocity[i];
		}
		if (!this.isTrigger) {
			var clear = true;
			for (var so in gpu.Solid) {
				if (gpu.Solid[so] != this) {
					if (gpu.checkCollision(tempP,this.collisionRadius,gpu.Solid[so].loc,gpu.Solid[so].collisionRadius)) {
						clear = false;
						tempP.onPhysicalHit(gpu.Solid[so])
						try {
							gpu.Solid[so].onPhysicalHit(tempP)
						} catch (error) {
							// Assume other object has been destroyed
						}
					}
				}
			} 
			if (clear) {
				this.loc = tempP;
			}
		} else {
			this.loc = tempP;
			for (var so in gpu.Trigger) {
				if (gpu.Trigger[so] != this) {
					if (gpu.checkCollision(tempP,this.collisionRadius,gpu.Trigger[so].loc,gpu.Trigger[so].collisionRadius)) {
						tempP.onTriggerHit(gpu.Trigger[so])
						try {
							gpu.Trigger[so].onTriggerHit(tempP)
						} catch (error) {
							// Assume other object has been destroyed
						}
					}
				}
			} 
		}
		// Update local offset
		this.mLocalOffset = this.calculateOffset();
	}

	_parentedUpdate() {
		// Update self
		this.updateCounter += 1;
		this.update();
		// Update children
		for (var child of this.children) {
			child._parentedUpdate();
		}
	}

	_parentedRender(commandPass, mParentOffset) {
		var mWorldOffset = undefined;
		if (mParentOffset) mWorldOffset = math.multiply(mParentOffset, this.mLocalOffset);
		// Render self
		this.renderCounter += 1;
		this.render(commandPass, mWorldOffset);
		// Render children
		for (var child of this.children) {
			if (mParentOffset === undefined)
				console.warn("Warning: (" + this.id.toString() + ") Rendering children without an offset is unusual.");
			child._parentedRender(commandPass, mWorldOffset);
		}
	}

	update() {
		console.error(this.name +" update() is not implemented.");
	}

	render(commandPass, offset) {
		console.error(this.name + " render() is not implemented!");
	}

	onTriggerHit(other) {
		
	}
	
	onPhysicalHit(other) {
		
	}
}

class Demo extends GameObject
{
	constructor() {
		super();
	}
}