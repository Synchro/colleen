ZN.Project = function () {
    this.id="";
    this.name="";

    this.position=[];
    this.analytics = {

        clsCount:{},
        userCount:{},

        clsPercent:{},
        userPercent:{},

        userData:[],
        clsData:[]

    };

    this.timeseries = {
        c:{series:{},count:{}},
        u:{series:{},count:{}}
    };
    this.shapes=[];


    // graphics
    this.x = 0;
    this.y = 0;
    this.scale = 0.9;
    this.rotation = 0.0;


}

ZN.Project.prototype = {
    constructor:ZN.Project,


    setProps: function(props){
        for (var prop in props) {
            if (props.hasOwnProperty(prop)) {
                var value = props[prop];
                switch(prop){
                    case "classification_count":
                        this.classificationCount = value;

                        break;
                    default:
                        this[prop] = value;
                }
            }
        }

    },


    setStyles:function(data){
        //this.shapes = data.shapes;

        _.each(data,function(value,key){
            if(typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'){
                this[key] = value;
            }
        },this);


        var fillScale = null;
        if(data.hasOwnProperty('fills')){
            fillScale = chroma.scale([data.fills[0],data.fills[1]]);
        }

        var nShapes = data.shapes.length;

        _.map(data.shapes,function(shape){
            var ids = shape.id.split('.');
            var nParents = ids.length-1;
            if(nParents>0){
                ids.pop();

                var parentId = ids.join('.');
                shape['parentId'] = parentId;

            }
        });

        data.shapes = _.sortBy(data.shapes, function(shape) {
            var matches = shape.id.match(/\./g);
            var ret = matches?matches.length:0;
            return ret;
        });


        _.each(data.shapes,function(shapeData,index){

            var shape = new ZN.Shape();
            shape.createTrail();


            var parent = null;
            if(shapeData.hasOwnProperty('parentId')){
                isChild = true;
                var parentId = shapeData.parentId;
                parent = _.find(this.shapes,{'id':parentId});
                if(parent){
                    shape.parent = parent;
                    shape.parent.children.push(shape);
                }
                else{
                    console.log('Parse shapes. Parent not found.');
                }

            }
            this.shapes.push(shape);


            _.each(shapeData,function(value,key){
                shape[key] = value;
                if(key!="id"){
                    shape.initial[key]=value;
                }
            });

            if(fillScale){
                shape.fill = fillScale(index/nShapes).hex();
            }


            //if(parent) shape.fill="#000000";
            //shape.opacity=0.2;


            shape.fillObj = chroma(shape.fill).alpha(shape.opacity);
            shape.fill = shape.fillObj.css();


            // bounds
            var bounds = new ZN.Bounds();
            if(shapeData.bounds){
                var b = shapeData.bounds;
                _.each(shapeData.bounds,function(value,key){
                    shapeData.bounds[key] = parseFloat(value);
                });
                bounds.setBounds(b.x, b.y, b.x+ b.width, b.y+ b.height);
            }

            shape.bounds = bounds;

            // paths
            var pathStr = shapeData.d;
            var segsAbs = Snap.path.toAbsolute(pathStr);
            shape.pathSegs = segsAbs;


            // find bounds
            var x, y, ox= 0, oy=0, mx=0, my=0,
                minx=10e6, //Number.MAX_VALUE,
                miny=10e6,//Number.MAX_VALUE,
                maxx=-10e6,//Number.MAX_VALUE,
                maxy=-10e6;//Number.MAX_VALUE;

            _.each(segsAbs,function(seg){
                switch(seg[0]){
                    case "M":
                        x = seg[1];
                        y = seg[2];
                        mx = x, my=y;
                        break;
                    case "C":
                        x = seg[5];
                        y = seg[6];
                        break;
                };

                if(seg[0]=="M" || seg[0]=="C"){
                    if(x<minx) minx = x;
                    if(x>maxx) maxx = x;
                    if(y<miny) miny = y;
                    if(y>maxy) maxy = y;
                }

            },this);



            var ox =  (minx+maxx)/2;
            var oy =  (miny+maxy)/2;



            shape.x = shape.initial.x = ox;
            shape.y = shape.initial.y = oy;
            shape.width = maxx-minx;
            shape.height = maxy-miny;


            // set origin to centre of shape
            var shapeStr = "";
            _.each(segsAbs,function(seg){
                switch(seg[0]){
                    case "M":
                        seg[1] -= ox;
                        seg[2] -= oy;
                        mx = x, my=y;
                        shapeStr+="M"+seg[1]+","+seg[2];
                        break;
                    case "C":
                        seg[1] -= ox;
                        seg[2] -= oy;
                        seg[3] -= ox;
                        seg[4] -= oy;
                        seg[5] -= ox;
                        seg[6] -= oy;
                        seg.shift();
                        shapeStr+="C"+seg.join(",");

                        break;
                };
            },this);
            shapeStr+="z";
            shape.d = shapeStr;

            // for child shapes set origin to parent
            if(parent){
                shape.x = shape.initial.x = ox-parent.x;
                shape.y = shape.initial.y = oy-parent.y;

            }

            segsAbs = Snap.path.toAbsolute(shapeStr);
            shape.pathSegs = segsAbs;


        },this);
    }


}

ZN.Shape = function () {
    this.id="";
    this.x=0;
    this.y=0;
    this.vx=0;
    this.vy=0;
    this.sx=1.0;
    this.sy=1.0;
    this.path=null;
    this.pathSegs=[];
    this.d = "";
    this.fill="0x000000";
    this.flllObj = null;
    this.rotation=0;
    this.opacity = 1.0;
    this.width=0;
    this.height=0;

    this.bounds = null;
    this.boundsPath = null;

    this.children=[];
    this.parent=null;
    this.initial={
        x:0,y:0,fill:0,rotation:0,opacity:0,d:""
    };
    this.trail = null;

}

ZN.Shape.prototype = {
    constructor:ZN.Shape,

    getPoints:function(){
        var pts=[];
        _.each(this.pathSegs,function(seg){
            switch(seg[0]){
                case "L":
                    pts.push({x:seg[1],y:seg[2]});
                    break;
                case "C":
                    pts.push({x:seg[5],y:seg[6]});
                    break;
            };

        },this);

        return pts;

    },
    createTrail: function(opts){

        this.trail = new ZN.Trail();
        this.trail.type = "point";

    },

    setTrailData: function(shape){
        this.x = shape.x;
        this.y = shape.y;
        this.rotation = shape.rotation;
        this.sx = shape.sx;
        this.sy = shape.sy;
        this.d = shape.d;
        this.opacity = shape.opacity;
        this.fill = shape.fill;

    },

    addTrailShape: function(){

        switch(this.trail.type){
            case "path":

                var shape = new ZN.Shape();
                shape.setTrailData(this);

                this.trail.shapes.push(shape);
                break;
            case "point":


                var pts = this.getPoints();
                for(var p=0;p<pts.length;p++){
                    var pt = pts[p];

                    var shape = new ZN.Shape();
                    shape.setTrailData(this);

                    shape.sx = this.sx*3.0;
                    shape.sy = this.sy*3.0;

                    shape.x = pt.x + this.x;
                    shape.y = pt.y + this.y;

                    var squarePath =
                        "M-0.5,-0.5L-0.5,0.5L0.5,0.5L0.5,-0.5L-0.5,-0.5Z";
                     /*  "M-0.5,-0.5"+
                    "C-0.5,0.5,-0.5,0.5,-0.5,0.5"
                    "C0.5,0.5,C0.5,0.5,C0.5,0.5"+
                    "C0.5,-0.5,C0.5,-0.5,C0.5,-0.5"+
                    "C-0.5,-0.5,-0.5,-0.5,-0.5,-0.5z"*/

                    shape.d = squarePath;



                    this.trail.shapes.push(shape);
                }

                break;


        }

    }

}


ZN.Trail = function(){
    this.type = "path"; // "points"; //
    this.shapes = [];


}
ZN.Trail.prototype = {
    constructor:ZN.Trail,

    init: function(){

    }

};



ZN.Bounds = function(){
    this.left=0;
    this.right=0;
    this.top=0;
    this.bottom=0;
}

ZN.Bounds.prototype = {
    constructor:ZN.Bounds,
    setBounds:function(l,t,r,b){
        this.left=l;
        this.right=r;
        this.top=t;
        this.bottom=b;
    },
    width:function(){
        return this.right-this.left;
    },
    height:function(){
        return this.bottom-this.top;
    }


}