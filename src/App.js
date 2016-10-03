import React, { Component } from 'react';
import Dragonfly from './dragonfly.js';
import DragonBallCollection from './dragonballs.js';
import WeevilCollection from './weevils.js';
import SpitballCollection from './spitballs.js';
import LaserBase from './laserbase.js';
import ExplosionCollection from './explosions.js';

import './App.css';

class App extends Component {

	// Construction ////

	constructor(props) {
		super(props);
		this.state = {
			context: null,
			fieldWidth: 640, 	// width of game
			fieldHeight: 640,	// height of game
			canvasWidth: 640,	// width of canvas
			canvasHeight: 640,	// height of canvas
			offsetLeft: null,		// horizontal start coordinate of playfield relative to canvas
			offsetTop: null,		// vertical start coordinate of playfield relative to canvas
			scale: null,				// scale of game playfield (canvas pixel : game pixel ratio)
			laserOriginRadius: 60,
			laserCooldown: 5,

			maxSpitballs: 4,
			bases: 3,
			score: 0,
			highScore: 0,
			level: 1,
			inGame: false,
			paused: false,
			laserNTemp: 0,
			laserETemp: 0,
			laserSTemp: 0,
			laserWTemp: 0,
			readyToPlay: true,
			nextWeevilToSpit: 0,
			wavesCleared: 0,
		}
		
		this.weevilCollection = null;
		this.dragonfly = null;
		this.spitballs = null;
		this.dragonballs = null;
		this.explosionCollection = null;
		this.animationTimer = null;
	}

	// Lifecycle Events ////

	componentWillMount() {

	}

	componentDidMount() {
		const context = this.refs.canvas.getContext('2d');
		this.fitToViewport(context); // resize the canvas and scale the playfield if it's too large

		this.setState({
			context: context,
		});
		
		this.laserBase = new LaserBase(context, this.fieldWidth, this.fieldHeight);
		this.dragonfly = new Dragonfly(context, this.fieldWidth, this.fieldHeight);
		this.weevilCollection = new WeevilCollection(context, this.fieldWidth, this.fieldHeight);
		this.spitballCollection = new SpitballCollection(context, this.fieldWidth, this.fieldHeight);
		this.explosionCollection = new ExplosionCollection(context, this.fieldWidth, this.fieldHeight);
		this.dragonballCollection = new DragonBallCollection(context, this.fieldWidth, this.fieldHeight);

		this.dragonfly.hidden = true;

		// register event listeners:
		window.addEventListener('keydown', this._keyDown.bind(this));
		window.addEventListener('touchstart', this._touchStart.bind(this));
		window.addEventListener('mousedown', this._mouseDown.bind(this));
		window.addEventListener('resize', this._resize.bind(this));

		this.animationTimer = setInterval(this._update.bind(this),1000 / this.props.framesPerSecond); // 60fps = 16.67ms
	}
	
	shouldComponentUpdate(nextProps, nextState) {
		if(nextState.canvasWidth !== this.state.canvasWidth || nextState.canvasHeight !== this.state.canvasHeight) {
			return true;
		} else {
			return false;
		}
	}

	componentWillUnmount() {
		window.removeEventListener('keydown', this._keyDown.bind(this));
		window.removeEventListener('touchstart', this._touchStart.bind(this));
		window.removeEventListener('mousedown', this._mouseDown.bind(this));
		window.removeEventListener('resize', this._resize.bind(this));

		clearInterval(this.animationTimer);
	}

	// Event Handling ////
	_update() {

		if(this.state.paused)
			return;

		if(this.state.inGame){

			// clear
			this.clearPlayField();

			// draw
			this.drawAll();

			// update
			this.weevilCollection.update();
			this.launchNewSpitballs();

			this.spitballCollection.update(() => { /* onHit */
				this.clearEnemies();
				this.clearPlayField('#ff0000'); // red flash
				this.setState({bases: this.state.bases-1});
				if(this.state.bases <= 0)
					this.endGame();
			});

			this.dragonballCollection.update((x,y) => { /* onHit */
				
				this.explosionCollection.add(x, y, 1.0);
				setTimeout(()=>{
					this.clearPlayField('#ff0000'); // red flash
					this.setState({bases: this.state.bases-1});
					this.clearEnemies();
					if(this.state.bases <= 0)
						this.endGame();
				},1000);
			
			});

			this.coolLasers();
			this.dragonfly.update();
			this.explosionCollection.update();

		} else {
			if(this.state.readyToPlay){
				this.clearPlayField();
				this.drawStartScreen();
			}
		}
	}

	_keyDown(evt) {

	//	if(!evt)
	//		var evt = window.event; // for old MSIE browsers that don't pass evt as parameter


		if(this.state.inGame){
			switch(evt.key) {
				case 'ArrowUp':
				case 'Up': // IE 
					this.fireLaser('N');
					break;
				case 'ArrowDown':
				case 'Down': // IE
					this.fireLaser('S');
					break;
				case 'ArrowLeft':
				case 'Left': // IE
					this.fireLaser('W');
					break;
				case 'ArrowRight':
				case 'Right': // IE
					this.fireLaser('E');
					break;
				case 'p':
					this.togglePause();
					break;
				case 't':
					let x = this.dragonfly.getPosition().x;
					let y = this.dragonfly.getPosition().y;
					let r = this.dragonfly.getPosition().r;
					this.dragonballCollection.dragonBalls.push({x: x, y: y, vx: 0.3, vy: 0.3});

					// test
					break;
				default:
			}
		} else {
			if(this.state.readyToPlay)
				this.startGame();
		}
	}

	_touchStart(evt) {
	
//		if(!evt)
//			var evt = window.event; // for old MSIE browsers that don't pass evt as parameter

		evt.preventDefault(); // stop annoying panning / zooming behaviour in browser (IOS)
		const ctx = this.state.context;
		const h = ctx.canvas.height;
		const w = ctx.canvas.width;
		let canvasX = evt.targetTouches[0].pageX - ctx.canvas.offsetLeft;
		let canvasY = evt.targetTouches[0].pageY - ctx.canvas.offsetTop;
		
		if (canvasX <= 0 || canvasY < 0 || canvasX > ctx.canvas.width || canvasY > ctx.canvas.height) {
			// outside the canvas
			return;
		}

		let m = w / h;
		let n = h / w;
		let ma = canvasX / canvasY;
		let mb = (h - canvasY) / canvasX;

		let zone = '';

		/*
		// for debugging:
		// console.log(h,w,canvasX,canvasY);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.strokeStyle = "#0000ff";
		ctx.moveTo(0,0);
		ctx.lineTo(w,h);
		ctx.stroke();
		
		ctx.moveTo(w,0);
		ctx.lineTo(0,h);
		ctx.stroke();
		ctx.restore();		
		*/

		if (ma > m) {
			
			if (mb > n) {
				zone = 'N';
			} else {
				zone = 'E';
			}
			
		} else {
			
			if (mb > n) {
				zone = 'W';
			} else {
				zone = 'S';
			}
		}

//		// console.log(zone);

		if(this.state.inGame) {
			this.fireLaser(zone);
		} else {
			if(this.state.readyToPlay)
				this.startGame();
		}

	}

	_mouseDown(evt) {

	//	if(!evt)
	//		var evt = window.event; // for old MSIE browsers that don't pass evt as parameter

		const ctx = this.state.context;
		const h = ctx.canvas.height;
		const w = ctx.canvas.width;
		let canvasX = evt.pageX - ctx.canvas.offsetLeft;
		let canvasY = evt.pageY - ctx.canvas.offsetTop;

		if (canvasX <= 0 || canvasY < 0 || canvasX > w || canvasY > h) {
			// outside the canvas
			return;
		}

		let m = w / h;
		let n = h / w;
		let ma = canvasX / canvasY;
		let mb = (h - canvasY) / canvasX;

		let zone = '';

		/*
		// for debugging:
		// console.log(h,w,canvasX,canvasY);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.strokeStyle = "#00ff00";
		ctx.moveTo(0,0);
		ctx.lineTo(w,h);
		ctx.stroke();
		
		ctx.moveTo(w,0);
		ctx.lineTo(0,h);
		ctx.stroke();
		ctx.restore();		
		*/		

		if (ma > m) {
			
			if (mb > n) {
				zone = 'N';
			} else {
				zone = 'E';
			}
			
		} else {
			
			if (mb > n) {
				zone = 'W';
			} else {
				zone = 'S';
			}	
		}

//		// console.log(zone);

		if(this.state.inGame) {
			this.fireLaser(zone);
		} else {
			if(this.state.readyToPlay)
				this.startGame();
		}
		
	}
	
	_resize(evt) {
		this.fitToViewport(this.state.context, 100 /* percentOfViewport */);
		if(this.state.paused) {
			this.clearPlayField();
			this.drawAll();
			this.drawMessage('Paused');
		}
	}

	// Drawing Functions ////

	fitToViewport(context, percentOfViewport = 100) {
		let w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
		let h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
			
		let scaleX = w / this.state.fieldWidth;
		let scaleY = h / this.state.fieldHeight;
		let scale = Math.min(scaleX, scaleY) * (percentOfViewport / 100.0);

		// determine new canvas dimensions:
		let newCanvasWidth = Math.floor(this.state.fieldWidth * scale);
		let newCanvasHeight = Math.floor(this.state.fieldHeight * scale);
		
		// determine offsets for centering the playfield:
		let offsetTop = 0.5 * (newCanvasHeight - this.state.fieldHeight * scale);
		let offsetLeft = 0.5 * (newCanvasWidth - this.state.fieldWidth * scale);

		this.setState({
			offsetLeft: offsetLeft,
			offsetTop: offsetTop,
			canvasWidth: newCanvasWidth,	// width of canvas
			canvasHeight: newCanvasHeight,	// height of canvas
			scale: scale,				// scale of game playfield (canvas pixel : game pixel ratio)
		},()=>{
			context.setTransform(1, 0, 0, 1, 0, 0); // reset whatever previous transforms were in-place
			context.scale(scale, scale);	// set scale	
			context.translate(offsetLeft, offsetTop); // position playfield in the center of canvas
		});
	}

	clearPlayField(color="#000000") {
		const ctx = this.state.context;
		ctx.save();
		ctx.globalAlpha = 0.3;
		ctx.fillStyle =color;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillRect(0,0,this.state.canvasWidth,this.state.canvasHeight);
		ctx.restore();
	}
	
	drawAll() {
		this.dragonballCollection.drawNext();
		this.laserBase.drawNext();
		this.weevilCollection.drawNext();
		this.spitballCollection.drawNext();
		this.dragonfly.drawNext();
		this.explosionCollection.drawNext();
		this.drawScores();
	}

	drawStartScreen() {
		const ctx = this.state.context;
		ctx.save();
		ctx.globalAlpha = 1;
		ctx.fillStyle = "#ffffff";
		ctx.font = "48px sans-serif";
		const text = "Press Any Key to Start";
		let textWidth = ctx.measureText(text).width;
		ctx.fillText(text,(this.state.fieldWidth-textWidth)/2, this.state.fieldHeight / 2);
		ctx.restore();
	}

	drawMessage(message) {
		const ctx = this.state.context;
		ctx.save();
		ctx.globalAlpha = 1;
		ctx.fillStyle = "#ffffff";
		ctx.font = "48px sans-serif";
		let textWidth = ctx.measureText(message).width;
		ctx.fillText(message,(this.state.fieldWidth-textWidth)/2, this.state.fieldHeight / 2);
		ctx.restore();
	}
	
	drawScores() {
		const ctx = this.state.context;
		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.fillStyle = "#ffffff";
		ctx.font = "18px Lucida Console";
		let s='SCORE: ' + this.state.score;
		let hs='HI-SCORE: ' + this.state.highScore;
		let b='BASES: ' + this.state.bases;
		let l='LEVEL: ' + this.state.level;
		let hsWidth = ctx.measureText(hs).width;
		let lWidth = ctx.measureText(l).width;
		ctx.fillText(s, 10, 20);
		ctx.fillText(hs, this.state.fieldWidth - 10 - hsWidth, 20);
		ctx.fillText(b, 10, this.state.fieldHeight - 10);
		ctx.fillText(l, this.state.fieldWidth - 10 - lWidth,  this.state.fieldHeight - 10);
		ctx.restore();
	}

	// Game state manipulation ////

	startGame() {
		this.setState({
			bases: 3,
			score: 0,
			level: 1,
			inGame: true,
			laserNTemp: 0,
			laserETemp: 0,
			laserSTemp: 0,
			laserWTemp: 0,
		});
		
		this.clearEnemies();
		this.dragonfly.hidden = true;
		this.dragonfly.selectFlightPathByName('box');
	}

	endGame() {

		// wait 100ms, display 'Game Over', then wait 3s and then allow new games ...
		setTimeout(()=>{
			this.setState({
				inGame: false,
				readyToPlay: false,
			});

			this.clearPlayField();
			this.drawMessage('Game Over');
			
			setTimeout(()=>{this.setState({readyToPlay: true})},3000);
		},100);
	}

	togglePause() {
		this.setState({paused: !this.state.paused});
		if(this.state.paused)
			this.drawMessage('Paused');
	}

	clearEnemies() {
		this.weevilCollection.weevils = [];
		this.spitballCollection.spitballs = [];
		this.explosionCollection.clear();
		this.dragonballCollection.clear();
	}

	bumpScore(amount) {
		this.setState({score: this.state.score + amount});
			if(this.state.score >= this.state.highScore)
				this.setState({highScore: this.state.score});
	}

	// update functions ////
	
	launchNewSpitballs() {
		// conditionally launch new spitballs: 
		if(this.spitballCollection.spitballs.length < this.state.maxSpitballs) {
			const weevilPositions = ['N','E','S','W'];
			let j = this.state.nextWeevilToSpit; // for round-robin;
			for(let i=0; i<weevilPositions.length; i++) {
				let direction = weevilPositions[j];
				this.setState({nextWeevilToSpit: j >= weevilPositions.length ? 0 : j+1}); // round-robin mechanism 
				let weevil=this.weevilCollection.weevils.filter(b => b.direction === direction)[0]; // IE11 compatibility: x.filter(f)[0] subsituted for x.find(f)
				if(weevil !== undefined && weevil.ready) {
					this.spitballCollection.launchSpitball(direction);
				}
			}
		}
	}

	fireLaser(targetDirection) {
	 
		if(this.state.paused)
			return;

		switch(targetDirection) {
			case 'N':
				if(this.state.laserNTemp !== 0)
					return;
				this.setState({laserNTemp: this.state.laserCooldown});
				break;
			case 'S':
				 if(this.state.laserSTemp !== 0)
					return;
				this.setState({laserSTemp: this.state.laserCooldown});
				break;
			case 'W':
				if(this.state.laserWTemp !== 0)
					return;
				this.setState({laserWTemp: this.state.laserCooldown});
				break;
			case 'E':
				if(this.state.laserETemp !== 0)
					return;
				this.setState({laserETemp: this.state.laserCooldown});
				break;
			default:
		}

		let laserHitPosition =0;
		let spitballHit = false;
		let spitballHitIndex = 0;
		
		if(this.spitballCollection.spitballs.length !== 0) { // check for spitball collisions
			for(let i=0; i<this.spitballCollection.spitballs.length; i++) {
				if(this.spitballCollection.spitballs[i].ready && this.spitballCollection.spitballs[i].direction === targetDirection) {
					let spitballPos = this.spitballCollection.spitballs[i].position;
					if(spitballPos > laserHitPosition){ // record the closest (most advanced) spitball
						laserHitPosition = spitballPos;
						spitballHitIndex = i;
						spitballHit = true;
					}
				}
			}
		}

		if(spitballHit) {
			this.spitballCollection.spitballs.splice(spitballHitIndex,1);
			this.laserBase.drawLaserBeam(targetDirection, laserHitPosition+this.spitballCollection.spitballLength);
			this.bumpScore(200);
			return;
		}

		if(this.weevilCollection.weevils.length !== 0) { // check for weevil collisions
			for(let i=this.weevilCollection.weevils.length-1; i>=0; i--) {
				let weevilOfInterest = this.weevilCollection.weevils[i];
				if(weevilOfInterest.ready && weevilOfInterest.direction === targetDirection) {
					this.laserBase.drawLaserBeam(targetDirection, this.weevilCollection.weevilRadius + this.weevilCollection.weevilMargin);
					this.weevilCollection.weevils.splice(i,1);
					this.bumpScore(750);
					let weevilCoordinates = this.weevilCollection.getWeevilPosition(targetDirection);
					this.explosionCollection.add(weevilCoordinates.x ,weevilCoordinates.y, 1.2);
					this.spitballCollection.cancelSpitballs(targetDirection);
					if(this.weevilCollection.allDead()){
						this.setState({wavesCleared: this.state.wavesCleared + 1});
						// console.log('waves cleared:', this.state.wavesCleared);
						if(	this.state.wavesCleared >= 5){
							this.setState({wavesCleared: 0});
							this.dragonfly.hidden = false;
						}
					}
					return;
				}
			}
		}

		if(this.dragonfly.isHit(targetDirection)) {
			// console.log('dragonfly hit!');
			this.dragonfly.hidden = true;
			let dragonflyCoordinates = this.dragonfly.getPosition();
			this.explosionCollection.add(dragonflyCoordinates.x, dragonflyCoordinates.y, 2.0);
			this.setState({level: this.state.level + 1, wavesCleared: 0});
			this.bumpScore(2000);
		}

		this.laserBase.drawLaserBeam(targetDirection,0); // miss
	}

	coolLasers() {
		this.setState({
			laserNTemp: Math.max(0,this.state.laserNTemp-1),
			laserETemp: Math.max(0,this.state.laserETemp-1),
			laserSTemp: Math.max(0,this.state.laserSTemp-1),
			laserWTemp: Math.max(0,this.state.laserWTemp-1),
		});
	}

	// the render() function ////

	render() {
		return (
			<div className="App">
				<canvas ref="canvas" width={this.state.canvasWidth} height={this.state.canvasHeight}/>
			</div>
		);
	}
}

// props

App.propTypes = {framesPerSecond: React.PropTypes.number};
App.defaultProps = {framesPerSecond: 60};

export default App;