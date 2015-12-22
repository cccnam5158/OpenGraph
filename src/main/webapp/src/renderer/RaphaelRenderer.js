/**
 * Raphael 라이브러리를 이용하여 구현한 랜더러 캔버스 클래스
 * - 노드에 추가되는 속성 : _type, _shape, _selected, _from, _to, _fromedge, _toedge
 * - 노드에 저장되는 값 : shape : { geom, angle, image, text }, data : 커스텀 Object
 *
 * @class
 * @extends OG.renderer.IRenderer
 * @requires OG.common.*, OG.geometry.*, OG.shape.*, raphael-2.1.0
 *
 * @param {HTMLElement,String} container 컨테이너 DOM element or ID
 * @param {Number[]} containerSize 컨테이너 Width, Height
 * @param {String} backgroundColor 캔버스 배경색
 * @param {String} backgroundImage 캔버스 배경이미지
 * @param {Object} config Configuration
 * @author <a href="mailto:hrkenshin@gmail.com">Seungbaek Lee</a>
 */
OG.renderer.RaphaelRenderer = function (container, containerSize, backgroundColor, backgroundImage, config) {
    OG.renderer.RaphaelRenderer.superclass.call(this, arguments);

    this._CONFIG = config;
    this._PAPER = new Raphael(container, containerSize ? containerSize[0] : null, containerSize ? containerSize[1] : null);

    // 최상위 그룹 엘리먼트 초기화
    this._ROOT_GROUP = this._add(this._PAPER.group(), null, OG.Constants.NODE_TYPE.ROOT);
    this._ETC_GROUP = this._add(this._PAPER.group(), null, OG.Constants.NODE_TYPE.ETC);
    this._PAPER.id = "OG_" + this._ID_PREFIX;
    this._PAPER.canvas.id = "OG_" + this._ID_PREFIX;
    this._CANVAS_COLOR = backgroundColor || this._CONFIG.CANVAS_BACKGROUND;

    $(this._PAPER.canvas).css({
        "background-color": this._CANVAS_COLOR,
        "user-select": "none",
        "-o-user-select": "none",
        "-moz-user-select": "none",
        "-khtml-user-select": "none",
        "-webkit-user-select": "none"
    });
    if (backgroundImage) {
        $(this._PAPER.canvas).css({"background-image": backgroundImage});
    }

    // container 에 keydown 이벤트 가능하도록
    $(this._PAPER.canvas.parentNode).attr("tabindex", "0");
    $(this._PAPER.canvas.parentNode).css({"outline": "none"});

    // container 의 position 을 static 인 경우 offset 이 깨지므로 relative 로 보정
    if ($(this._PAPER.canvas.parentNode).css('position') === 'static') {
        $(this._PAPER.canvas.parentNode).css({
            position: 'relative',
            left: '0',
            top: '0'
        });
    }
};
OG.renderer.RaphaelRenderer.prototype = new OG.renderer.IRenderer();
OG.renderer.RaphaelRenderer.superclass = OG.renderer.IRenderer;
OG.renderer.RaphaelRenderer.prototype.constructor = OG.renderer.RaphaelRenderer;
OG.RaphaelRenderer = OG.renderer.RaphaelRenderer;

/**
 * ID를 발급하고 ID:rElement 해쉬맵에 추가한다.
 *
 * @param {Raphael.Element} rElement 라파엘 엘리먼트
 * @param {String} id 지정ID
 * @param {String} nodeType Node 유형(ROOT, SHAPE ...)
 * @param {String} shapeType Shape 유형(GEOM, TEXT, IMAGE, EDGE, GROUP ...)
 * @return {Raphael.Element} rElement 라파엘 엘리먼트
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._add = function (rElement, id, nodeType, shapeType) {
    rElement.id = id || this._genId();
    rElement.node.id = rElement.id;
    rElement.node.raphaelid = rElement.id;
    if (nodeType) {
        $(rElement.node).attr("_type", nodeType);
    }
    if (shapeType) {
        $(rElement.node).attr("_shape", shapeType);
    }
    this._ELE_MAP.put(rElement.id, rElement);

    return rElement;
};

OG.renderer.RaphaelRenderer.prototype.setCanvas = function (canvas) {
    this._CANVAS = canvas;
};

/**
 * 라파엘 엘리먼트를 하위 엘리먼트 포함하여 제거한다.
 *
 * @param {Raphael.Element} rElement 라파엘 엘리먼트
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._remove = function (rElement) {
    var childNodes, i;
    if (rElement) {
        childNodes = rElement.node.childNodes;
        for (i = childNodes.length - 1; i >= 0; i--) {
            this._remove(this._getREleById(childNodes[i].id));
        }
        this._ELE_MAP.remove(rElement.id);
        rElement.remove();
    }
};

/**
 * 하위 엘리먼트만 제거한다.
 *
 * @param {Raphael.Element} rElement 라파엘 엘리먼트
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._removeChild = function (rElement) {
    var childNodes, i;
    if (rElement) {
        childNodes = rElement.node.childNodes;
        for (i = childNodes.length - 1; i >= 0; i--) {
            this._remove(this._getREleById(childNodes[i].id));
        }
    }
};

/**
 * ID에 해당하는 RaphaelElement 를 반환한다.
 *
 * @param {String} id ID
 * @return {Raphael.Element} RaphaelElement
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._getREleById = function (id) {
    return this._ELE_MAP.get(id);
};

/**
 * Geometry 를 캔버스에 드로잉한다.(Recursive)
 *
 * @param {Element} groupElement Group DOM Element
 * @param {OG.geometry.Geometry} geometry 기하 객체
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {Object} parentStyle Geometry Collection 인 경우 상위 Geometry 스타일
 * @return {Element}
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._drawGeometry = function (groupElement, geometry, style, parentStyle) {
    var me = this, i = 0, pathStr = "", vertices, element, geomObj, _style = {}, connectGuideElement
    getRoundedPath = function (rectangle, radius) {
        var rectObj, rectVert, offset1, offset2, angle, array = [],
            getRoundedOffset = function (coord, dist, deg) {
                var theta = Math.PI / 180 * deg;
                return new OG.geometry.Coordinate(
                    OG.Util.round(coord.x + dist * Math.cos(theta)),
                    OG.Util.round(coord.y + dist * Math.sin(theta))
                );
            };

        rectObj = OG.JSON.decode(rectangle.toString());
        rectVert = rectangle.getVertices();
        angle = rectObj.angle;

        offset1 = getRoundedOffset(rectVert[0], radius, 90 + angle);
        offset2 = getRoundedOffset(rectVert[0], radius, angle);
        array = array.concat(["M", offset1.x, offset1.y, "Q", rectVert[0].x, rectVert[0].y, offset2.x, offset2.y]);

        offset1 = getRoundedOffset(rectVert[1], radius, 180 + angle);
        offset2 = getRoundedOffset(rectVert[1], radius, 90 + angle);
        array = array.concat(["L", offset1.x, offset1.y, "Q", rectVert[1].x, rectVert[1].y, offset2.x, offset2.y]);

        offset1 = getRoundedOffset(rectVert[2], radius, 270 + angle);
        offset2 = getRoundedOffset(rectVert[2], radius, 180 + angle);
        array = array.concat(["L", offset1.x, offset1.y, "Q", rectVert[2].x, rectVert[2].y, offset2.x, offset2.y]);

        offset1 = getRoundedOffset(rectVert[3], radius, angle);
        offset2 = getRoundedOffset(rectVert[3], radius, 270 + angle);
        array = array.concat(["L", offset1.x, offset1.y, "Q", rectVert[3].x, rectVert[3].y, offset2.x, offset2.y, "Z"]);

        return array.toString();
    }, getConnectGuideStyle = function () {
        return me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_EVENT_AREA
    }, setConnectGuideAttr = function (ele) {
        ele.attr(getConnectGuideStyle());
    };

    if (parentStyle) {
        OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {},
            OG.Util.apply({}, geometry.style.map, OG.Util.apply({}, parentStyle, me._CONFIG.DEFAULT_STYLE.GEOM)));
    } else {
        OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {},
            OG.Util.apply({}, geometry.style.map, me._CONFIG.DEFAULT_STYLE.GEOM));
    }

    geometry.style.map = _style;

    // 타입에 따라 드로잉
    switch (geometry.TYPE) {
        case OG.Constants.GEOM_TYPE.POINT:
            element = this._PAPER.circle(geometry.coordinate.x, geometry.coordinate.y, 0.5);
            element.attr(_style);

            connectGuideElement = this._PAPER.circle(geometry.coordinate.x, geometry.coordinate.y, 0.5);
            setConnectGuideAttr(connectGuideElement);
            break;

        case OG.Constants.GEOM_TYPE.LINE:
        case OG.Constants.GEOM_TYPE.POLYLINE:
        case OG.Constants.GEOM_TYPE.POLYGON:
            pathStr = "";
            vertices = geometry.getVertices();
            for (i = 0; i < vertices.length; i++) {
                if (i === 0) {
                    pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                } else {
                    pathStr += "L" + vertices[i].x + " " + vertices[i].y;
                }
            }
            element = this._PAPER.path(pathStr);
            element.attr(_style);

            connectGuideElement = this._PAPER.path(pathStr);
            setConnectGuideAttr(connectGuideElement);
            break;
        case OG.Constants.GEOM_TYPE.RECTANGLE:
            if ((_style.r || 0) === 0) {
                pathStr = "";
                vertices = geometry.getVertices();
                for (i = 0; i < vertices.length; i++) {
                    if (i === 0) {
                        pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                    } else {
                        pathStr += "L" + vertices[i].x + " " + vertices[i].y;
                    }
                }
            } else {
                pathStr = getRoundedPath(geometry, _style.r || 0);
            }

            element = this._PAPER.path(pathStr);
            element.attr(_style);

            connectGuideElement = this._PAPER.path(pathStr);
            setConnectGuideAttr(connectGuideElement);
            break;

        case OG.Constants.GEOM_TYPE.CIRCLE:
            geomObj = OG.JSON.decode(geometry.toString());
            if (geomObj.type === OG.Constants.GEOM_NAME[OG.Constants.GEOM_TYPE.CIRCLE]) {
                element = this._PAPER.circle(geomObj.center[0], geomObj.center[1], geomObj.radius);
                connectGuideElement = this._PAPER.circle(geomObj.center[0], geomObj.center[1], geomObj.radius);
            } else if (geomObj.type === OG.Constants.GEOM_NAME[OG.Constants.GEOM_TYPE.ELLIPSE]) {
                if (geomObj.angle === 0) {
                    element = this._PAPER.ellipse(geomObj.center[0], geomObj.center[1], geomObj.radiusX, geomObj.radiusY);
                    connectGuideElement = this._PAPER.ellipse(geomObj.center[0], geomObj.center[1], geomObj.radiusX, geomObj.radiusY);
                } else {
                    pathStr = "";
                    vertices = geometry.getControlPoints();
                    pathStr = "M" + vertices[1].x + " " + vertices[1].y + "A" + geomObj.radiusX + " " + geomObj.radiusY
                        + " " + geomObj.angle + " 1 0 " + vertices[5].x + " " + vertices[5].y;
                    pathStr += "M" + vertices[1].x + " " + vertices[1].y + "A" + geomObj.radiusX + " " + geomObj.radiusY
                        + " " + geomObj.angle + " 1 1 " + vertices[5].x + " " + vertices[5].y;
                    element = this._PAPER.path(pathStr);
                    connectGuideElement = this._PAPER.path(pathStr);
                }
            }
            element.attr(_style);
            setConnectGuideAttr(connectGuideElement);
            break;

        case OG.Constants.GEOM_TYPE.ELLIPSE:
            geomObj = OG.JSON.decode(geometry.toString());
            if (geomObj.angle === 0) {
                element = this._PAPER.ellipse(geomObj.center[0], geomObj.center[1], geomObj.radiusX, geomObj.radiusY);
                connectGuideElement = this._PAPER.ellipse(geomObj.center[0], geomObj.center[1], geomObj.radiusX, geomObj.radiusY);
            } else {
                pathStr = "";
                vertices = geometry.getControlPoints();
                pathStr = "M" + vertices[1].x + " " + vertices[1].y + "A" + geomObj.radiusX + " " + geomObj.radiusY
                    + " " + geomObj.angle + " 1 0 " + vertices[5].x + " " + vertices[5].y;
                pathStr += "M" + vertices[1].x + " " + vertices[1].y + "A" + geomObj.radiusX + " " + geomObj.radiusY
                    + " " + geomObj.angle + " 1 1 " + vertices[5].x + " " + vertices[5].y;
                element = this._PAPER.path(pathStr);
                connectGuideElement = this._PAPER.path(pathStr);
            }
            element.attr(_style);
            setConnectGuideAttr(connectGuideElement);
            break;

        case OG.Constants.GEOM_TYPE.CURVE:
            pathStr = "";
            vertices = geometry.getControlPoints();
            for (i = 0; i < vertices.length; i++) {
                if (i === 0) {
                    pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                } else if (i === 1) {
                    pathStr += "R" + vertices[i].x + " " + vertices[i].y;
                } else {
                    pathStr += " " + vertices[i].x + " " + vertices[i].y;
                }
            }
            element = this._PAPER.path(pathStr);
            element.attr(_style);

            connectGuideElement = this._PAPER.path(pathStr);
            setConnectGuideAttr(connectGuideElement);
            break;

        case OG.Constants.GEOM_TYPE.BEZIER_CURVE:
            pathStr = "";
            vertices = geometry.getControlPoints();
            for (i = 0; i < vertices.length; i++) {
                if (i === 0) {
                    pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                } else if (i === 1) {
                    pathStr += "C" + vertices[i].x + " " + vertices[i].y;
                } else {
                    pathStr += " " + vertices[i].x + " " + vertices[i].y;
                }
            }
            element = this._PAPER.path(pathStr);
            element.attr(_style);

            connectGuideElement = this._PAPER.path(pathStr);
            setConnectGuideAttr(connectGuideElement);
            break;

        case OG.Constants.GEOM_TYPE.COLLECTION:
            for (i = 0; i < geometry.geometries.length; i++) {
                // recursive call
                this._drawGeometry(groupElement, geometry.geometries[i], style, geometry.style.map);
            }
            break;
    }

    if (element) {
        this._add(element);

        groupElement.appendChild(element.node);
        if (connectGuideElement) {
            this._add(connectGuideElement);
            groupElement.appendChild(connectGuideElement.node);
            $('#' + connectGuideElement.node.id).attr('name', OG.Constants.CONNECT_GUIDE_EVENT_AREA.NAME);
        }

        return element.node;
    } else {
        return groupElement;
    }
};

/**
 * Shape 의 Label 을 캔버스에 위치 및 사이즈 지정하여 드로잉한다.
 *
 * @param {Number[]} position 드로잉할 위치 좌표(중앙 기준)
 * @param {String} text 텍스트
 * @param {Number[]} size Text Width, Height, Angle
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {String} id Element ID 지정
 * @param {Boolean} isEdge 라인여부(라인인 경우 라벨이 가려지지 않도록)
 * @return {Element} DOM Element
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._drawLabel = function (position, text, size, style, id, isEdge) {
    var me = this, LABEL_PADDING = me._CONFIG.LABEL_PADDING,
        width = size ? size[0] - LABEL_PADDING * 2 : null,
        height = size ? size[1] - LABEL_PADDING * 2 : null,
        angle = size ? size[2] || 0 : 0,
        group, element, rect, _style = {}, text_anchor, geom,
        bBox, left, top, x, y;
    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {}, me._CONFIG.DEFAULT_STYLE.TEXT);

    // ID 지정된 경우 존재하면 하위 노드 제거
    if (id === 0 || id) {
        group = this._getREleById(id);
        if (group) {
            this._removeChild(group);
        } else {
            group = this._PAPER.group();
            this._add(group, id);
        }
    } else {
        group = this._PAPER.group();
        this._add(group, id);
    }

    // text-anchor 리셋
    text_anchor = _style["text-anchor"] || 'middle';
    _style["text-anchor"] = 'middle';

    //크롬일 때
    if (navigator.userAgent.toLowerCase().indexOf("mozilla") != -1) {
        //Text Filter for foreignObject
        if (text) {
            text = text.replace(/\n/g, '<br />');
        }

        // Draw text
        if (_style["label-direction"] === 'vertical') {
            element = this._PAPER.foreignObject(text, position[0], position[1], height, size[1]);
        } else {
            element = this._PAPER.foreignObject(text, position[0], position[1], size[0], size[1]);
        }
    } else if (navigator.userAgent.toLowerCase().indexOf("msie") != -1) {
        //익스플로러일 대
        // Draw text
        element = this._PAPER.text(position[0], position[1], text, size);
        element.attr(_style);
    }

    // real size
    bBox = element.getBBox();

    // calculate width, height, left, top
    width = width ? (width > bBox.width ? width : bBox.width) : bBox.width;
    height = height ? (height > bBox.height ? height : bBox.height) : bBox.height;
    left = OG.Util.round(position[0] - width / 2);
    top = OG.Util.round(position[1] - height / 2);

    // Boundary Box
    geom = new OG.Rectangle([left, top], width, height);

    if (navigator.userAgent.toLowerCase().indexOf("mozilla") != -1) {
        if (_style["label-direction"] === 'vertical') {
            // Text Horizontal Align
            switch (text_anchor) {
                case "start":
                    y = geom.getBoundary().getLowerCenter().y;
                    break;
                case "end":
                    y = geom.getBoundary().getUpperCenter().y - bBox.height;
                    break;
                case "middle":
                    y = OG.Util.round(geom.getBoundary().getCentroid().y - bBox.height / 2);
                    break;
                default:
                    y = OG.Util.round(geom.getBoundary().getCentroid().y - bBox.height / 2);
                    break;
            }

            // Text Vertical Align
            switch (_style["vertical-align"]) {
                case "top":
                    x = OG.Util.round(geom.getBoundary().getLeftCenter().x - bBox.width / 2) + 5;
                    break;
                case "bottom":
                    x = geom.getBoundary().getRightCenter().x - bBox.width;
                    break;
                case "middle":
                    x = geom.getBoundary().getCentroid().x - bBox.width;
                    break;
                default:
                    x = geom.getBoundary().getCentroid().x - bBox.width;
                    break;
            }

            angle = -90;
        } else {
            // Text Horizontal Align
            switch (text_anchor) {
                case "start":
                    x = geom.getBoundary().getLeftCenter().x;
                    break;
                case "end":
                    x = geom.getBoundary().getRightCenter().x - bBox.width;
                    break;
                case "middle":
                    x = OG.Util.round(geom.getBoundary().getCentroid().x - bBox.width / 2);
                    break;
                default:
                    x = OG.Util.round(geom.getBoundary().getCentroid().x - bBox.width / 2);
                    break;
            }

            // Text Vertical Align
            switch (_style["vertical-align"]) {
                case "top":
                    y = geom.getBoundary().getUpperCenter().y;
                    break;
                case "bottom":
                    y = geom.getBoundary().getLowerCenter().y - bBox.height;
                    break;
                case "middle":
                    y = OG.Util.round(geom.getBoundary().getCentroid().y - bBox.height / 2);
                    break;
                default:
                    y = OG.Util.round(geom.getBoundary().getCentroid().y - bBox.height / 2);
                    break;
            }
        }
    }
    else if (navigator.userAgent.toLowerCase().indexOf("msie") != -1) {
        if (_style["label-direction"] === 'vertical') {
            // Text Horizontal Align
            switch (text_anchor) {
                case "start":
                    y = geom.getBoundary().getLowerCenter().y;
                    break;
                case "end":
                    y = geom.getBoundary().getUpperCenter().y;
                    break;
                case "middle":
                    y = geom.getBoundary().getCentroid().y;
                    break;
                default:
                    y = geom.getBoundary().getCentroid().y;
                    break;
            }

            // Text Vertical Align
            switch (_style["vertical-align"]) {
                case "top":
                    x = OG.Util.round(geom.getBoundary().getLeftCenter().x + bBox.height / 2);
                    break;
                case "bottom":
                    x = OG.Util.round(geom.getBoundary().getRightCenter().x - bBox.height / 2);
                    break;
                case "middle":
                    x = geom.getBoundary().getCentroid().x;
                    break;
                default:
                    x = geom.getBoundary().getCentroid().x;
                    break;
            }

            angle = -90;
        } else {
            // Text Horizontal Align
            switch (text_anchor) {
                case "start":
                    x = geom.getBoundary().getLeftCenter().x;
                    break;
                case "end":
                    x = geom.getBoundary().getRightCenter().x;
                    break;
                case "middle":
                    x = geom.getBoundary().getCentroid().x;
                    break;
                default:
                    x = geom.getBoundary().getCentroid().x;
                    break;
            }

            // Text Vertical Align
            switch (_style["vertical-align"]) {
                case "top":
                    y = OG.Util.round(geom.getBoundary().getUpperCenter().y + bBox.height / 2);
                    break;
                case "bottom":
                    y = OG.Util.round(geom.getBoundary().getLowerCenter().y - bBox.height / 2);
                    break;
                case "middle":
                    y = geom.getBoundary().getCentroid().y;
                    break;
                default:
                    y = geom.getBoundary().getCentroid().y;
                    break;
            }
        }
    }

    // text align, font-color, font-size 적용
    element.attr({
        x: x,
        y: y,
        stroke: "none",
        fill: _style["font-color"] || me._CONFIG.DEFAULT_STYLE.LABEL["font-color"],
        "font-size": _style["font-size"] || me._CONFIG.DEFAULT_STYLE.LABEL["font-size"],
        "fill-opacity": 1
    });

    if (text != "") {
        $(element.node).css({
            "background-color": _style["fill"] || me._CONFIG.DEFAULT_STYLE.LABEL["fill"]
        });
    }

    $(element.node).css({
        "cursor": "move"
    });

    // angle 적용
    if (angle || _style["label-angle"]) {
        if (angle === 0) {
            angle = parseInt(_style["label-angle"], 10);
        }
        element.rotate(angle);
    }

    // text-anchor 적용
    element.attr({
        'text-anchor': text_anchor
    });

    // 라인인 경우 overwrap 용 rectangle
    if (isEdge && text) {
        // real size
        bBox = element.getBBox();

        rect = this._PAPER.rect(bBox.x - LABEL_PADDING / 2, bBox.y - LABEL_PADDING / 2,
            bBox.width + LABEL_PADDING, bBox.height + LABEL_PADDING);
        rect.attr({stroke: "none", fill: this._CANVAS_COLOR, 'fill-opacity': 0});
        this._add(rect);
        group.node.appendChild(rect.node);
    }

    // Add to group
    this._add(element, id + "FO");
    group.node.appendChild(element.node);

    return group.node;
};

/**
 * Shape 을 캔버스에 위치 및 사이즈 지정하여 드로잉한다.
 *
 * @example
 * renderer.drawShape([100, 100], new OG.CircleShape(), [50, 50], {stroke:'red'});
 *
 * @param {Number[]} position 드로잉할 위치 좌표(중앙 기준)
 * @param {OG.shape.IShape} shape Shape
 * @param {Number[]} size Shape Width, Height
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {String} id Element ID 지정
 * @return {Element} Group DOM Element with geometry
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawShape = function (position, shape, size, style, id) {
    var width = size ? size[0] : 100,
        height = size ? size[1] : 100,
        groupNode, geometry, text, image, html,
        me = this, change = false;

    //id가 없을때와 있을때를 구분..
    if (!id) {
        change = true;
    }

    if (shape instanceof OG.shape.GeomShape) {
        geometry = shape.createShape();

        // 좌상단으로 이동 및 크기 조정
        geometry.moveCentroid(position);
        geometry.resizeBox(width, height);

        groupNode = this.drawGeom(geometry, style, id);
        shape.geom = groupNode.geom;


    } else if (shape instanceof OG.shape.TextShape) {
        text = shape.createShape();

        groupNode = this.drawText(position, text, size, style, id);
        shape.text = groupNode.text;
        shape.angle = groupNode.angle;
        shape.geom = groupNode.geom;
    } else if (shape instanceof OG.shape.ImageShape) {
        image = shape.createShape();

        groupNode = this.drawImage(position, image, size, style, id);
        shape.image = groupNode.image;
        shape.angle = groupNode.angle;
        shape.geom = groupNode.geom;
    } else if (shape instanceof OG.shape.HtmlShape) {
        html = shape.createShape();

        groupNode = this.drawHtml(position, html, size, style, id);
        shape.html = groupNode.html;
        shape.angle = groupNode.angle;
        shape.geom = groupNode.geom;
    } else if (shape instanceof OG.shape.EdgeShape) {
        geometry = shape.geom || shape.createShape();

        groupNode = this.drawEdge(geometry, style, id);
        shape.geom = groupNode.geom;
    } else if (shape instanceof OG.shape.GroupShape) {
        geometry = shape.createShape();

        // 좌상단으로 이동 및 크기 조정
        geometry.moveCentroid(position);
        geometry.resizeBox(width, height);

        groupNode = this.drawGroup(geometry, style, id);

        shape.geom = groupNode.geom;
    }

    if (shape.geom) {
        groupNode.shape = shape;
    }
    groupNode.shapeStyle = (style instanceof OG.geometry.Style) ? style.map : style;

    $(groupNode).attr("_shape_id", shape.SHAPE_ID);


    // Draw Label
    if (!(shape instanceof OG.shape.TextShape)) {
        this.drawLabel(groupNode);

        if (shape instanceof  OG.shape.EdgeShape) {
            this.drawEdgeLabel(groupNode, null, 'FROM');
            this.drawEdgeLabel(groupNode, null, 'TO');
        }
    }
    if (groupNode.geom) {
        if (OG.Util.isIE7()) {
            groupNode.removeAttribute("geom");
        } else {
            delete groupNode.geom;
        }
    }
    if (groupNode.text) {
        if (OG.Util.isIE7()) {
            groupNode.removeAttribute("text");
        } else {
            delete groupNode.text;
        }
    }
    if (groupNode.image) {
        if (OG.Util.isIE7()) {
            groupNode.removeAttribute("image");
        } else {
            delete groupNode.image;
        }
    }
    if (groupNode.angle) {
        if (OG.Util.isIE7()) {
            groupNode.removeAttribute("angle");
        } else {
            delete groupNode.angle;
        }
    }


    if ($(shape).attr('auto_draw') == 'yes') {
        $(groupNode).attr('auto_draw', 'yes');
    }

    // drawShape event fire
    $(this._PAPER.canvas).trigger('drawShape', [groupNode]);

    if (change && style != me._CONFIG.DEFAULT_STYLE.EDGE_SHADOW)
        $(this._PAPER.canvas).trigger('change');

    return groupNode;
};

/**
 * Geometry 를 캔버스에 드로잉한다.
 *
 * @param {OG.geometry.Geometry} geometry 기하 객체
 * @param {OG.geometry.Style,Object} style 스타일
 * @return {Element} Group DOM Element with geometry
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawGeom = function (geometry, style, id) {
    var me = this, group, _style = {};

    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {});

    // ID 지정된 경우 존재하면 하위 노드 제거
    if (id === 0 || id) {
        group = this._getREleById(id);
        if (group) {
            this._removeChild(group);
        } else {
            group = this._PAPER.group();
            this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.GEOM);
            this._ROOT_GROUP.node.appendChild(group.node);
        }
    } else {
        group = this._PAPER.group();
        this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.GEOM);
        this._ROOT_GROUP.node.appendChild(group.node);
    }
    // Draw geometry
    this._drawGeometry(group.node, geometry, _style);
    group.node.geom = geometry;
    group.attr(me._CONFIG.DEFAULT_STYLE.SHAPE);

    if (group.node.shape) {
        group.node.shape.geom = geometry;

        if (group.node.geom) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("geom");
            } else {
                delete group.node.geom;
            }
        }
    }

    return group.node;
};

/**
 * Text 를 캔버스에 위치 및 사이즈 지정하여 드로잉한다.
 *
 * @param {Number[]} position 드로잉할 위치 좌표(중앙 기준)
 * @param {String} text 텍스트
 * @param {Number[]} size Text Width, Height, Angle
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {String} id Element ID 지정
 * @return {Element} DOM Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawText = function (position, text, size, style, id) {
    var me = this, width = size ? size[0] : null,
        height = size ? size[1] : null,
        angle = size ? size[2] || 0 : 0,
        group, element, _style = {}, geom,
        bBox, left, top, x, y;
    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {}, me._CONFIG.DEFAULT_STYLE.TEXT);

    // ID 지정된 경우 존재하면 하위 노드 제거
    if (id === 0 || id) {
        group = this._getREleById(id);
        if (group) {
            this._removeChild(group);
        } else {
            group = this._PAPER.group();
            this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.TEXT);
            this._ROOT_GROUP.node.appendChild(group.node);
        }
    } else {
        group = this._PAPER.group();
        this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.TEXT);
        this._ROOT_GROUP.node.appendChild(group.node);
    }

    // Draw text
    element = this._PAPER.text(position[0], position[1], text, 8);
    element.attr(_style);

    // real size
    bBox = element.getBBox();

    // calculate width, height, left, top
    width = width ? (width > bBox.width ? width : bBox.width) : bBox.width;
    height = height ? (height > bBox.height ? height : bBox.height) : bBox.height;
    left = OG.Util.round(position[0] - width / 2);
    top = OG.Util.round(position[1] - height / 2);

    // Boundary Box
    geom = new OG.Rectangle([left, top], width, height);
    geom.style.map = _style;

    // Text Horizontal Align
    switch (_style["text-anchor"]) {
        case "start":
            x = geom.getBoundary().getLeftCenter().x;
            break;
        case "end":
            x = geom.getBoundary().getRightCenter().x;
            break;
        case "middle":
            x = geom.getBoundary().getCentroid().x;
            break;
        default:
            x = geom.getBoundary().getCentroid().x;
            break;
    }

    // Text Vertical Align
    switch (_style["vertical-align"]) {
        case "top":
            y = OG.Util.round(geom.getBoundary().getUpperCenter().y + bBox.height / 2);
            break;
        case "bottom":
            y = OG.Util.round(geom.getBoundary().getLowerCenter().y - bBox.height / 2);
            break;
        case "middle":
            y = geom.getBoundary().getCentroid().y;
            break;
        default:
            y = geom.getBoundary().getCentroid().y;
            break;
    }

    // text align 적용
    element.attr({x: x, y: y});

    // font-color, font-size 적용
    element.attr({
        stroke: "none",
        fill: _style["font-color"] || me._CONFIG.DEFAULT_STYLE.LABEL["font-color"],
        "font-size": _style["font-size"] || me._CONFIG.DEFAULT_STYLE.LABEL["font-size"]
    });

    // angle 적용
    if (angle) {
        element.rotate(angle);
    }

    // Add to group
    this._add(element);
    group.node.appendChild(element.node);
    group.node.text = text;
    group.node.angle = angle;
    group.node.geom = geom;
    group.attr(me._CONFIG.DEFAULT_STYLE.SHAPE);

    if (group.node.shape) {
        group.node.shape.text = text;
        group.node.shape.angle = angle;
        group.node.shape.geom = geom;

        if (group.node.text) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("text");
            } else {
                delete group.node.text;
            }
        }
        if (group.node.angle) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("angle");
            } else {
                delete group.node.angle;
            }
        }
        if (group.node.geom) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("geom");
            } else {
                delete group.node.geom;
            }
        }
    }

    return group.node;
};

/**
 * 임베드 HTML String 을 캔버스에 위치 및 사이즈 지정하여 드로잉한다.
 *
 * @param {Number[]} position 드로잉할 위치 좌표(중앙 기준)
 * @param {String} html 임베드 HTML String
 * @param {Number[]} size Image Width, Height, Angle
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {String} id Element ID 지정
 * @return {Element} DOM Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawHtml = function (position, html, size, style, id) {
    var me = this, width = size ? size[0] : null,
        height = size ? size[1] : null,
        angle = size ? size[2] || 0 : 0,
        group, element, _style = {}, bBox, geom, left, top;
    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {}, me._CONFIG.DEFAULT_STYLE.HTML);

    // ID 지정된 경우 존재하면 하위 노드 제거
    if (id === 0 || id) {
        group = this._getREleById(id);
        if (group) {
            this._removeChild(group);
        } else {
            group = this._PAPER.group();
            this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.HTML);
            this._ROOT_GROUP.node.appendChild(group.node);
        }
    } else {
        group = this._PAPER.group();
        this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.HTML);
        this._ROOT_GROUP.node.appendChild(group.node);
    }

    // Draw foreign object
    element = this._PAPER.foreignObject(html, position[0], position[1], width, height);
    element.attr(_style);

    // real size
    bBox = element.getBBox();

    // calculate width, height, left, top
    width = width || bBox.width;
    height = height || bBox.height;
    left = OG.Util.round(position[0] - width / 2);
    top = OG.Util.round(position[1] - height / 2);

    // text align 적용
    element.attr({x: left, y: top});

    geom = new OG.Rectangle([left, top], width, height);
    if (angle) {
        element.rotate(angle);
    }
    geom.style.map = _style;

    // Add to group
    this._add(element);
    group.node.appendChild(element.node);
    group.node.html = html;
    group.node.angle = angle;
    group.node.geom = geom;
    group.attr(me._CONFIG.DEFAULT_STYLE.SHAPE);

    if (group.node.shape) {
        group.node.shape.html = html;
        group.node.shape.angle = angle;
        group.node.shape.geom = geom;

        if (group.node.html) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("html");
            } else {
                delete group.node.html;
            }
        }
        if (group.node.angle) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("angle");
            } else {
                delete group.node.angle;
            }
        }
        if (group.node.geom) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("geom");
            } else {
                delete group.node.geom;
            }
        }
    }

    return group.node;
};

/**
 * Image 를 캔버스에 위치 및 사이즈 지정하여 드로잉한다.
 *
 * @param {Number[]} position 드로잉할 위치 좌표(중앙 기준)
 * @param {String} imgSrc 이미지경로
 * @param {Number[]} size Image Width, Height, Angle
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {String} id Element ID 지정
 * @return {Element} DOM Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawImage = function (position, imgSrc, size, style, id) {
    var me = this, width = size ? size[0] : null,
        height = size ? size[1] : null,
        angle = size ? size[2] || 0 : 0,
        group, element, _style = {}, bBox, geom, left, top;
    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {}, me._CONFIG.DEFAULT_STYLE.IMAGE);

    // ID 지정된 경우 존재하면 하위 노드 제거
    if (id === 0 || id) {
        group = this._getREleById(id);
        if (group) {
            this._removeChild(group);
        } else {
            group = this._PAPER.group();
            this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.IMAGE);
            this._ROOT_GROUP.node.appendChild(group.node);
        }
    } else {
        group = this._PAPER.group();
        this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.IMAGE);
        this._ROOT_GROUP.node.appendChild(group.node);
    }

    // Draw image
    element = this._PAPER.image(imgSrc, position[0], position[1], width, height);
    element.attr(_style);

    // real size
    bBox = element.getBBox();

    // calculate width, height, left, top
    width = width || bBox.width;
    height = height || bBox.height;
    left = OG.Util.round(position[0] - width / 2);
    top = OG.Util.round(position[1] - height / 2);

    // text align 적용
    element.attr({x: left, y: top});

    geom = new OG.Rectangle([left, top], width, height);
    if (angle) {
        element.rotate(angle);
    }
    geom.style.map = _style;

    // Add to group
    this._add(element);
    group.node.appendChild(element.node);
    group.node.image = imgSrc;
    group.node.angle = angle;
    group.node.geom = geom;
    group.attr(me._CONFIG.DEFAULT_STYLE.SHAPE);

    if (group.node.shape) {
        group.node.shape.image = imgSrc;
        group.node.shape.angle = angle;
        group.node.shape.geom = geom;

        if (group.node.image) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("image");
            } else {
                delete group.node.image;
            }
        }
        if (group.node.angle) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("angle");
            } else {
                delete group.node.angle;
            }
        }
        if (group.node.geom) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("geom");
            } else {
                delete group.node.geom;
            }
        }
    }

    return group.node;
};

/**
 * 사용자가 지정한 변곡점을 반환
 * - 조건:
 *   오직 4개의 점을 가지고있는 다각선에서
 *   변곡점이 자동으로 그려진 점의 위치가 아닐 때
 *
 * - issue: 사용자가 지정한 변곡점(?)은 유지되어야 함
 **/
OG.renderer.RaphaelRenderer.prototype._getPointOfInflectionFromEdge = function (line) {
    var offset = null, _startV, _endV, _centerV, _vertices, _ax, _ay;
    if (line instanceof OG.geometry.PolyLine) {
        _vertices = line.getVertices();
        //한개의 변곡점 일 때 처리하도록 함
        if (_vertices.length != 4) {
            return offset;
        }

        _startV = _vertices[0];
        _endV = _vertices[_vertices.length - 1];
        _centerV = _vertices[1];

        offset = {
            "x": _centerV["x"] - _startV["x"]
            , "y": _centerV["y"] - _startV["y"]
        };

        _ax = OG.Util.round((_endV["x"] - _startV["x"]) / 2);
        _ay = OG.Util.round((_endV["y"] - _startV["y"]) / 2);

        offset["x"] = (offset["x"] == _ax) ? 0 : offset["x"];
        offset["y"] = (offset["y"] == _ay) ? 0 : offset["y"];
    }

    return offset;
};

/**
 * 라인을 캔버스에 드로잉한다.
 * OG.geometry.Line 타입인 경우 EdgeType 에 따라 Path 를 자동으로 계산하며,
 * OG.geometry.PolyLine 인 경우는 주어진 Path 그대로 drawing 한다.
 *
 * @param {OG.geometry.Line,OG.geometry.PolyLine} line 또는 polyLine
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {String} id Element ID 지정
 * @param {Boolean} isSelf 셀프 연결 여부
 * @return {Element} Group DOM Element with geometry
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawEdge = function (line, style, id, isSelf, pointOfInflection) {

    var me = this, group, _style = {},
        vertices = line.getVertices(),
        from = vertices[0], to = vertices[vertices.length - 1],
        points = [], edge, edge_direction,
        getArrayOfOrthogonal_1 = function (from, to, isHorizontal) {
            if (isHorizontal) {
                return [
                    [from[0], from[1]],
                    [to[0], from[1]],
                    [to[0], to[1]]
                ];
            } else {
                return [
                    [from[0], from[1]],
                    [from[0], to[1]],
                    [to[0], to[1]]
                ];
            }
        },
        getArrayOfOrthogonal_2 = function (from, to, isHorizontal) {
            if (isHorizontal) {
                if (pointOfInflection && pointOfInflection["x"] > 0) {
                    return [
                        [from[0], from[1]],
                        [from[0] + pointOfInflection["x"], from[1]],
                        [from[0] + pointOfInflection["x"], to[1]],
                        [to[0], to[1]]
                    ];
                } else {
                    return [
                        [from[0], from[1]],
                        [OG.Util.round((from[0] + to[0]) / 2), from[1]],
                        [OG.Util.round((from[0] + to[0]) / 2), to[1]],
                        [to[0], to[1]]
                    ];
                }
            } else {
                if (pointOfInflection && pointOfInflection["y"] > 0) {
                    return [
                        [from[0], from[1]],
                        [from[0], from[1] + pointOfInflection["y"]],
                        [to[0], from[1] + pointOfInflection["y"]],
                        [to[0], to[1]]
                    ];
                } else {
                    return [
                        [from[0], from[1]],
                        [from[0], OG.Util.round((from[1] + to[1]) / 2)],
                        [to[0], OG.Util.round((from[1] + to[1]) / 2)],
                        [to[0], to[1]]
                    ];
                }
            }
        };

    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {},
        OG.Util.apply({}, line.style.map, me._CONFIG.DEFAULT_STYLE.EDGE));

    // ID 지정된 경우 존재하면 하위 노드 제거
    if (id === 0 || id) {
        group = this._getREleById(id);
        if (group) {
            this._removeEdgeChild(group);
        } else {
            group = this._PAPER.group();
            this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.EDGE);
            this._ROOT_GROUP.node.appendChild(group.node);
        }
    } else {
        group = this._PAPER.group();
        this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.EDGE);
        this._ROOT_GROUP.node.appendChild(group.node);
    }

    if (isSelf) {
        points = [
            [from.x, from.y - me._CONFIG.GUIDE_RECT_SIZE / 2],
            [from.x + me._CONFIG.GUIDE_RECT_SIZE * 2, from.y - me._CONFIG.GUIDE_RECT_SIZE],
            [from.x + me._CONFIG.GUIDE_RECT_SIZE * 2, from.y + me._CONFIG.GUIDE_RECT_SIZE],
            [from.x, from.y + me._CONFIG.GUIDE_RECT_SIZE / 2]
        ];
    } else if (line instanceof OG.geometry.Line) {
        // edgeType
        switch (_style["edge-type"].toLowerCase()) {
            case OG.Constants.EDGE_TYPE.STRAIGHT:
                points = [from, to];
                break;
            case OG.Constants.EDGE_TYPE.PLAIN:
                edge_direction = _style["edge-direction"].toLowerCase().split(" ");

                // 'c' 인 경우 위치 보정
                if (edge_direction[0] === "c" || edge_direction[1] === "c") {
                    edge_direction = this._adjustEdgeDirection(edge_direction[0], edge_direction[1], [from.x, from.y], [to.x, to.y]).split(" ");
                }
                points = [from, to];
                if (edge_direction[0] === "e") {
                    switch (edge_direction[1]) {
                        case "e":
                            if (from.x <= to.x) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x + me._CONFIG.EDGE_PADDING, to.y],
                                    true
                                );
                                points.push([to.x, to.y]);
                            } else {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x + me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y],
                                    false
                                ));
                            }
                            break;
                        case "w":
                            if (from.x <= to.x) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    true
                                );
                            } else {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x + me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x - me._CONFIG.EDGE_PADDING, to.y],
                                    false
                                ));
                                points.push([to.x, to.y]);
                            }
                            break;
                        case "s":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x, to.y + me._CONFIG.EDGE_PADDING],
                                    true
                                );
                                points.push([to.x, to.y]);
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    true
                                );
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x + me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y + me._CONFIG.EDGE_PADDING],
                                    false
                                ));
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x + me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y],
                                    false
                                ));
                            }
                            break;
                        case "n":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    true
                                );
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x + me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y - me._CONFIG.EDGE_PADDING],
                                    false
                                ));
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x + me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y],
                                    false
                                ));
                            } else if (from.x > to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x + me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y - me._CONFIG.EDGE_PADDING],
                                    false
                                ));
                                points.push([to.x, to.y]);
                            }
                            break;
                    }
                } else if (edge_direction[0] === "w") {
                    switch (edge_direction[1]) {
                        case "e":
                            if (from.x <= to.x) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x - me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x + me._CONFIG.EDGE_PADDING, to.y],
                                    false
                                ));
                                points.push([to.x, to.y]);
                            } else {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    true
                                );
                            }
                            break;
                        case "w":
                            if (from.x <= to.x) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x - me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y],
                                    false
                                ));

                            } else {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x - me._CONFIG.EDGE_PADDING, to.y],
                                    true
                                );
                                points.push([to.x, to.y]);
                            }
                            break;
                        case "s":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x - me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y + me._CONFIG.EDGE_PADDING],
                                    false
                                ));
                                points.push([to.x, to.y]);
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x - me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y],
                                    false
                                ));
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x, to.y + me._CONFIG.EDGE_PADDING],
                                    true
                                );
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y > to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    true
                                );
                            }
                            break;
                        case "n":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x - me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y],
                                    false
                                ));
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x - me._CONFIG.EDGE_PADDING, from.y],
                                    [to.x, to.y - me._CONFIG.EDGE_PADDING],
                                    false
                                ));
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    true
                                ));
                            } else if (from.x > to.x && from.y > to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x, to.y - me._CONFIG.EDGE_PADDING],
                                    true
                                );
                                points.push([to.x, to.y]);
                            }
                            break;
                    }
                } else if (edge_direction[0] === "s") {
                    switch (edge_direction[1]) {
                        case "e":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x + me._CONFIG.EDGE_PADDING, to.y],
                                    false
                                );
                                points.push([to.x, to.y]);
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x, from.y + me._CONFIG.EDGE_PADDING],
                                    [to.x + me._CONFIG.EDGE_PADDING, to.y],
                                    true
                                ));
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    false
                                );
                            } else if (from.x > to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x, from.y + me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y],
                                    true
                                ));
                            }
                            break;
                        case "w":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    false
                                );
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x, from.y + me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y],
                                    true
                                ));
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x - me._CONFIG.EDGE_PADDING, to.y],
                                    false
                                );
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y > to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x, from.y + me._CONFIG.EDGE_PADDING],
                                    [to.x - me._CONFIG.EDGE_PADDING, to.y],
                                    true
                                ));
                                points.push([to.x, to.y]);
                            }
                            break;
                        case "s":
                            if (from.y <= to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y + me._CONFIG.EDGE_PADDING],
                                    false
                                );
                                points.push([to.x, to.y]);
                            } else {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x, from.y + me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y],
                                    true
                                ));
                            }
                            break;
                        case "n":
                            if (from.y <= to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    false
                                );
                            } else {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x, from.y + me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y - me._CONFIG.EDGE_PADDING],
                                    true
                                ));
                                points.push([to.x, to.y]);
                            }
                            break;
                    }
                } else if (edge_direction[0] === "n") {
                    switch (edge_direction[1]) {
                        case "e":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x, from.y - me._CONFIG.EDGE_PADDING],
                                    [to.x + me._CONFIG.EDGE_PADDING, to.y],
                                    true
                                ));
                                points.push([to.x, to.y]);
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x + me._CONFIG.EDGE_PADDING, to.y],
                                    false
                                );
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x, from.y - me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y],
                                    true
                                ));
                            } else if (from.x > to.x && from.y > to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    false
                                );
                            }
                            break;
                        case "w":
                            if (from.x <= to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x, from.y - me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y],
                                    true
                                ));
                            } else if (from.x <= to.x && from.y > to.y) {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    false
                                );
                            } else if (from.x > to.x && from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x, from.y - me._CONFIG.EDGE_PADDING],
                                    [to.x - me._CONFIG.EDGE_PADDING, to.y],
                                    true
                                ));
                                points.push([to.x, to.y]);
                            } else if (from.x > to.x && from.y > to.y) {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x - me._CONFIG.EDGE_PADDING, to.y],
                                    false
                                );
                                points.push([to.x, to.y]);
                            }
                            break;
                        case "s":
                            if (from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_2(
                                    [from.x, from.y - me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y + me._CONFIG.EDGE_PADDING],
                                    true
                                ));
                                points.push([to.x, to.y]);
                            } else {
                                points = getArrayOfOrthogonal_2(
                                    [from.x, from.y],
                                    [to.x, to.y],
                                    false
                                );
                            }
                            break;
                        case "n":
                            if (from.y <= to.y) {
                                points = [
                                    [from.x, from.y]
                                ];
                                points = points.concat(getArrayOfOrthogonal_1(
                                    [from.x, from.y - me._CONFIG.EDGE_PADDING],
                                    [to.x, to.y],
                                    true
                                ));
                            } else {
                                points = getArrayOfOrthogonal_1(
                                    [from.x, from.y],
                                    [to.x, to.y - me._CONFIG.EDGE_PADDING],
                                    false
                                );
                                points.push([to.x, to.y]);
                            }
                            break;
                    }
                }
                break;
            case OG.Constants.EDGE_TYPE.BEZIER:
                edge_direction = _style["edge-direction"].toLowerCase().split(" ");

                // 'c' 인 경우 위치 보정
                if (edge_direction[0] === "c" || edge_direction[1] === "c") {
                    edge_direction = this._adjustEdgeDirection(edge_direction[0], edge_direction[1], [from.x, from.y], [to.x, to.y]).split(" ");
                }

                points = this._bezierCurve([from.x, from.y], [to.x, to.y], edge_direction[0], edge_direction[1]);
                break;
        }
    } else if (line instanceof OG.geometry.Curve) {
        points = line.getControlPoints();
    } else if (line instanceof OG.geometry.BezierCurve) {
        points = line.getControlPoints();
    } else {
        points = vertices;
    }

    // Draw geometry
    if (isSelf) {
        edge = new OG.Curve(points);
    } else if (line instanceof OG.geometry.Curve) {
        edge = new OG.Curve(points);
    } else if (line instanceof OG.geometry.BezierCurve) {
        edge = new OG.BezierCurve(points);
    } else {
        if (_style["edge-type"].toLowerCase() === OG.Constants.EDGE_TYPE.BEZIER) {
            edge = new OG.BezierCurve(points);
        } else {
            edge = new OG.PolyLine(points);
        }
    }

    // draw Edge
    this._drawGeometry(group.node, edge, _style);
    group.node.geom = edge;
    group.attr(me._CONFIG.DEFAULT_STYLE.SHAPE);

    if (group.node.shape) {
        group.node.shape.geom = edge;

        if (group.node.geom) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("geom");
            } else {
                delete group.node.geom;
            }
        }
    }

    return group.node;
};

OG.renderer.RaphaelRenderer.prototype.drawGroup = function (geometry, style, id) {
    var me = this, group, geomElement, _style = {}, childNodes, i, boundary, titleLine, group_hidden, _tempStyle = {}, geom_shadow;

    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {});

    // ID 지정된 경우 존재하면 하위 노드 제거, 하위에 Shape 은 삭제하지 않도록
    if (id === 0 || id) {
        group = this._getREleById(id);
        if (group) {
            childNodes = group.node.childNodes;
            for (i = childNodes.length - 1; i >= 0; i--) {
                if ($(childNodes[i]).attr("_type") !== OG.Constants.NODE_TYPE.SHAPE) {
                    this._remove(this._getREleById(childNodes[i].id));
                }
            }
        } else {
            group = this._PAPER.group();
            this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.GROUP);
            this._ROOT_GROUP.node.appendChild(group.node);
        }
    } else {
        group = this._PAPER.group();
        this._add(group, id, OG.Constants.NODE_TYPE.SHAPE, OG.Constants.SHAPE_TYPE.GROUP);
        this._ROOT_GROUP.node.appendChild(group.node);
    }

    // Draw geometry
    geomElement = this._drawGeometry(group.node, geometry, _style);
    group.node.geom = geometry;
    group.attr(me._CONFIG.DEFAULT_STYLE.SHAPE);

    // Draw Hidden Shadow
    boundary = geometry.getBoundary();
    group_hidden = new OG.geometry.Rectangle(boundary.getUpperLeft()
        , (boundary.getUpperRight().x - boundary.getUpperLeft().x)
        , (boundary.getLowerLeft().y - boundary.getUpperLeft().y));
    if (me._CONFIG.ENABLE_CONTEXTMENU) {
        geom_shadow = this._drawGeometry(group.node, group_hidden, me._CONFIG.DEFAULT_STYLE.GROUP_SHADOW);
    } else {
        geom_shadow = this._drawGeometry(group.node, group_hidden, me._CONFIG.DEFAULT_STYLE.GROUP_SHADOW_MAPPER);
    }
    geom_shadow.style = new OG.geometry.Style({
        'cursor': "move"
    });

    // 타이틀 라인 Drawing
    OG.Util.apply(_tempStyle, geometry.style.map, _style);
    if (_tempStyle['label-direction'] && _tempStyle['vertical-align'] === 'top') {
        //boundary = geometry.getBoundary();
        if (_tempStyle['label-direction'] === 'vertical') {
            if (_tempStyle['title-size']) {
                titleLine = new OG.geometry.Line(
                    [boundary.getUpperLeft().x + _tempStyle['title-size'], boundary.getUpperLeft().y],
                    [boundary.getLowerLeft().x + _tempStyle['title-size'], boundary.getLowerLeft().y]
                );
                group_hidden = new OG.geometry.Rectangle(boundary.getUpperLeft(), _tempStyle['title-size'], (boundary.getLowerLeft().y - boundary.getUpperLeft().y));
            } else {
                titleLine = new OG.geometry.Line(
                    [boundary.getUpperLeft().x + 20, boundary.getUpperLeft().y],
                    [boundary.getLowerLeft().x + 20, boundary.getLowerLeft().y]
                );
                group_hidden = new OG.geometry.Rectangle(boundary.getUpperLeft(), 20, (boundary.getLowerLeft().y - boundary.getUpperLeft().y));
            }
        } else {
            if (_tempStyle['title-size']) {
                titleLine = new OG.geometry.Line(
                    [boundary.getUpperLeft().x, boundary.getUpperLeft().y + _tempStyle['title-size']],
                    [boundary.getUpperRight().x, boundary.getUpperRight().y + _tempStyle['title-size']]
                );
                group_hidden = new OG.geometry.Rectangle(boundary.getUpperLeft(), (boundary.getUpperRight().x - boundary.getUpperLeft().x), _tempStyle['title-size']);
            } else {
                titleLine = new OG.geometry.Line(
                    [boundary.getUpperLeft().x, boundary.getUpperLeft().y + 20],
                    [boundary.getUpperRight().x, boundary.getUpperRight().y + 20]
                );
                group_hidden = new OG.geometry.Rectangle(boundary.getUpperLeft(), (boundary.getUpperRight().x - boundary.getUpperLeft().x), 20);
            }
        }
        this._drawGeometry(group.node, titleLine, _style);
        this._drawGeometry(group.node, group_hidden, me._CONFIG.DEFAULT_STYLE.GROUP_HIDDEN);
    }

    // 위치조정
    if (geomElement.id !== group.node.firstChild.id) {
        group.node.insertBefore(geomElement, group.node.firstChild);
    }

    if (group.node.shape) {
        if (!group.node.shape.isCollapsed || group.node.shape.isCollapsed === false) {
            group.node.shape.geom = geometry;
        }

        if (group.node.geom) {
            if (OG.Util.isIE7()) {
                group.node.removeAttribute("geom");
            } else {
                delete group.node.geom;
            }
        }
    }

    return group.node;
};

/**
 * Shape 의 Label 을 캔버스에 위치 및 사이즈 지정하여 드로잉한다.
 *
 * @param {Element,String} shapeElement Shape DOM element or ID
 * @param {String} text 텍스트
 * @param {OG.geometry.Style,Object} style 스타일
 * @return {Element} DOM Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawLabel = function (shapeElement, text, style) {
    var rElement = this._getREleById(OG.Util.isElement(shapeElement) ? shapeElement.id : shapeElement),
        element, labelElement, envelope, _style = {}, size, beforeText, beforeEvent,
        /**
         * 라인(꺽은선)의 중심위치를 반환한다.
         *
         * @param {Element} element Edge 엘리먼트
         * @return {OG.Coordinate}
         */
        getCenterOfEdge = function (element) {
            var vertices, from, to, lineLength, distance = 0, i, intersectArray;

            if (element.shape.geom.style.get("edge-type") === OG.Constants.EDGE_TYPE.BEZIER) {
                vertices = element.shape.geom.getControlPoints();
                from = vertices[0];
                to = vertices[vertices.length - 1];
                return new OG.geometry.Coordinate(OG.Util.round((from.x + to.x) / 2), OG.Util.round((from.y + to.y) / 2));
            } else {
                // Edge Shape 인 경우 라인의 중간 지점 찾기
                vertices = element.shape.geom.getVertices();
                lineLength = element.shape.geom.getLength();

                for (i = 0; i < vertices.length - 1; i++) {
                    distance += vertices[i].distance(vertices[i + 1]);
                    if (distance > lineLength / 2) {
                        intersectArray = element.shape.geom.intersectCircleToLine(
                            vertices[i + 1], distance - lineLength / 2, vertices[i + 1], vertices[i]
                        );
                        break;
                    }
                }
                return intersectArray[0];
            }
        },
        centerOfEdge;

    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {});

    if (rElement && rElement.node.shape) {
        text = OG.Util.trim(text);
        element = rElement.node;
        envelope = element.shape.geom.getBoundary();
        beforeText = element.shape.label;

        // beforeLabelChange event fire
        if (text !== undefined && text !== beforeText) {
            beforeEvent = jQuery.Event("beforeLabelChange", {
                element: element,
                afterText: text,
                beforeText: beforeText
            });

            $(this._PAPER.canvas).trigger(beforeEvent);
            if (beforeEvent.isPropagationStopped()) {
                return false;
            }
            text = beforeEvent.afterText;
        }

        OG.Util.apply(element.shape.geom.style.map, _style);
        element.shape.label = text === undefined ? element.shape.label : text;

        if (element.shape.label !== undefined) {

            // label-position 에 따라 위치 조정
            switch (element.shape.geom.style.get("label-position")) {
                case "left":
                    position = [envelope.getCentroid().x - envelope.getWidth(), envelope.getCentroid().y];
                    break;
                case "right":
                    position = [envelope.getCentroid().x + envelope.getWidth(), envelope.getCentroid().y];
                    break;
                case "top":
                    position = [envelope.getCentroid().x, envelope.getCentroid().y - envelope.getHeight()];
                    break;
                case "bottom":
                    position = [envelope.getCentroid().x, envelope.getCentroid().y + envelope.getHeight()];
                    break;
                default:
                    position = [envelope.getCentroid().x, envelope.getCentroid().y];
                    break;
            }
            size = [envelope.getWidth(), envelope.getHeight()];
            // }

            labelElement = this._drawLabel(
                position,
                element.shape.label,
                size,
                element.shape.geom.style,
                element.id + OG.Constants.LABEL_SUFFIX,
                element.shape instanceof OG.shape.EdgeShape
            );
            element.appendChild(labelElement);

            // drawLabel event fire
            if (text !== undefined) {
                $(this._PAPER.canvas).trigger('drawLabel', [element, text]);
            }

            if (text !== undefined && beforeText !== undefined && text !== beforeText) {
                // labelChanged event fire
                $(this._PAPER.canvas).trigger('labelChanged', [element, text, beforeText]);
                $(this._PAPER.canvas).trigger('change');
            }
        }
    }

    return labelElement;
};

/**
 * Edge 의 from, to Label 을 캔버스에 위치 및 사이즈 지정하여 드로잉한다.
 *
 * @param {Element,String} shapeElement Shape DOM element or ID
 * @param {String} text 텍스트
 * @param {String} type 유형(FROM or TO)
 * @return {Element} DOM Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawEdgeLabel = function (shapeElement, text, type) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(shapeElement) ? shapeElement.id : shapeElement),
        element, vertices, labelElement, position, edgeLabel, suffix;

    if (rElement && rElement.node.shape) {
        text = OG.Util.trim(text);
        element = rElement.node;

        if (element.shape instanceof OG.shape.EdgeShape) {
            vertices = element.shape.geom.getVertices();
            if (type === 'FROM') {
                position = [vertices[0].x, vertices[0].y + me._CONFIG.FROMTO_LABEL_OFFSET_TOP];
                element.shape.fromLabel = text || element.shape.fromLabel;
                edgeLabel = element.shape.fromLabel;
                suffix = OG.Constants.FROM_LABEL_SUFFIX;
            } else {
                position = [vertices[vertices.length - 1].x, vertices[vertices.length - 1].y + me._CONFIG.FROMTO_LABEL_OFFSET_TOP];
                element.shape.toLabel = text || element.shape.toLabel;
                edgeLabel = element.shape.toLabel;
                suffix = OG.Constants.TO_LABEL_SUFFIX;
            }

            if (edgeLabel) {
                labelElement = this._drawLabel(
                    position,
                    edgeLabel,
                    [0, 0],
                    element.shape.geom.style,
                    element.id + suffix,
                    false
                );
                element.appendChild(labelElement);
            }
        }
    }

    return labelElement;
};


OG.renderer.RaphaelRenderer.prototype.resizeShape = function (element, excludeEdgeId) {
    if (element.shape instanceof OG.shape.HorizontalPoolShape) {
        var ele, eleArray = [], i, height = 0, titleSize;

        if (element.shape.geom.style.map['title-size'])
            titleSize = element.shape.geom.style.map['title-size'];

        for (i = 0; i < element.childNodes.length; i++) {
            ele = element.childNodes[i];
            if (ele.shape instanceof OG.shape.HorizontalLaneShape) {
                eleArray.push(ele);
            }
        }
        for (i = 0; i < eleArray.length; i++) {
            if ((element.shape.geom.boundary._width - titleSize) != eleArray[i].shape.geom.boundary._width) {
                var right = element.shape.geom.boundary._width - eleArray[i].shape.geom.boundary._width - titleSize;
                this.resize(eleArray[i], [0, 0, 0, right]);
            }
            if (i != (eleArray.length - 1)) {
                height += eleArray[i].shape.geom.boundary._height;
            } else {
                var lower = element.shape.geom.boundary._height - height - eleArray[i].shape.geom.boundary._height;
                this.resize(eleArray[i], [0, lower, 0, 0]);
            }
        }

    }

}

/**
 * Element 에 저장된 geom, angle, image, text 정보로 shape 을 redraw 한다.
 *
 * @param {Element} element Shape 엘리먼트
 * @param {String[]} excludeEdgeId redraw 제외할 Edge ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.redrawShape = function (element, excludeEdgeId, inclusion) {
    var me = this, envelope, center, width, height, upperLeft,
        redrawChildConnectedEdge;

    redrawChildConnectedEdge = function (_collapseRootElement, _element) {
        var edgeIdArray, fromEdge, toEdge, _childNodes = _element.childNodes, otherShape, i, j, isNeedToRedraw;
        for (i = _childNodes.length - 1; i >= 0; i--) {
            if ($(_childNodes[i]).attr("_type") === OG.Constants.NODE_TYPE.SHAPE) {
                redrawChildConnectedEdge(_collapseRootElement, _childNodes[i]);

                isNeedToRedraw = false;
                edgeIdArray = $(_childNodes[i]).attr("_fromedge");
                if (edgeIdArray) {
                    edgeIdArray = edgeIdArray.split(",");
                    for (j = 0; j < edgeIdArray.length; j++) {
                        fromEdge = me.getElementById(edgeIdArray[j]);
                        if (fromEdge) {
                            otherShape = me._getShapeFromTerminal($(fromEdge).attr("_from"));

                            // otherShape 이 같은 collapse 범위내에 있는지 체크
                            if ($(otherShape).parents("#" + _collapseRootElement.id).length === 0) {
                                isNeedToRedraw = true;
                            }
                        }
                    }
                }

                edgeIdArray = $(_childNodes[i]).attr("_toedge");
                if (edgeIdArray) {
                    edgeIdArray = edgeIdArray.split(",");
                    for (j = 0; j < edgeIdArray.length; j++) {
                        toEdge = me.getElementById(edgeIdArray[j]);
                        if (toEdge) {
                            otherShape = me._getShapeFromTerminal($(toEdge).attr("_to"));

                            // otherShape 이 같은 collapse 범위내에 있는지 체크
                            if ($(otherShape).parents("#" + _collapseRootElement.id).length === 0) {
                                isNeedToRedraw = true;
                            }
                        }
                    }
                }

                // group 영역 밖의 연결된 otherShape 이 있는 경우 redrawConnectedEdge
                if (isNeedToRedraw === true) {
                    me.redrawConnectedEdge(_childNodes[i]);
                }
            }
        }
    };

    if (element && element.shape.geom) {
        switch ($(element).attr("_shape")) {
            case OG.Constants.SHAPE_TYPE.GEOM:
                element = this.drawGeom(element.shape.geom, {}, element.id);
                this.redrawConnectedEdge(element, excludeEdgeId);
                this.drawLabel(element);
                break;
            case OG.Constants.SHAPE_TYPE.TEXT:
                envelope = element.shape.geom.getBoundary();
                center = envelope.getCentroid();
                width = envelope.getWidth();
                height = envelope.getHeight();
                element = this.drawText([center.x, center.y], element.shape.text,
                    [width, height, element.shape.angle], element.shape.geom.style, element.id);
                this.redrawConnectedEdge(element, excludeEdgeId);
                break;
            case OG.Constants.SHAPE_TYPE.IMAGE:
                envelope = element.shape.geom.getBoundary();
                center = envelope.getCentroid();
                width = envelope.getWidth();
                height = envelope.getHeight();
                element = this.drawImage([center.x, center.y], element.shape.image,
                    [width, height, element.shape.angle], element.shape.geom.style, element.id);
                this.redrawConnectedEdge(element, excludeEdgeId);
                this.drawLabel(element);
                break;
            case OG.Constants.SHAPE_TYPE.HTML:
                envelope = element.shape.geom.getBoundary();
                center = envelope.getCentroid();
                width = envelope.getWidth();
                height = envelope.getHeight();
                element = this.drawHtml([center.x, center.y], element.shape.html,
                    [width, height, element.shape.angle], element.shape.geom.style, element.id);
                this.redrawConnectedEdge(element, excludeEdgeId);
                this.drawLabel(element);
                break;
            case OG.Constants.SHAPE_TYPE.EDGE:
                element = this.drawEdge(element.shape.geom, element.shape.geom.style, element.id);
                this.drawLabel(element);
                this.drawEdgeLabel(element, null, 'FROM');
                this.drawEdgeLabel(element, null, 'TO');
                break;
            case OG.Constants.SHAPE_TYPE.GROUP:
                if (element.shape.isCollapsed === true) {
                    envelope = element.shape.geom.getBoundary();
                    upperLeft = envelope.getUpperLeft();
                    element = this.drawGroup(new OG.geometry.Rectangle(
                            upperLeft, me._CONFIG.COLLAPSE_SIZE * 3, me._CONFIG.COLLAPSE_SIZE * 2),
                        element.shape.geom.style, element.id);
                    redrawChildConnectedEdge(element, element);
                    this.redrawConnectedEdge(element, excludeEdgeId);
                } else {
                    element = this.drawGroup(element.shape.geom, element.shape.geom.style, element.id);
                    this.redrawConnectedEdge(element, excludeEdgeId);
                    this.drawLabel(element);
                }

                break;
        }
    }

    // redrawShape event fire
    $(this._PAPER.canvas).trigger('redrawShape', [element]);
    // setinclusion으로 그린 경우 트리거 발생 안하게 처리
    if (!inclusion) {
        $(this._PAPER.canvas).trigger('change');
    }
    return element;
};

/**
 * Shape 의 연결된 Edge 를 redraw 한다.(이동 또는 리사이즈시)
 *
 * @param {Element} element
 * @param {String[]} excludeEdgeId redraw 제외할 Edge ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.redrawConnectedEdge = function (element, excludeEdgeId) {
    var me = this, edgeId,
        rightAngleCalibration = function (edgeId) {
            //리드로우 하기 전에 shape과의 연결점과 연결점 이전의 라인이 수평 또는 수직인지 살피고
            //만약 그렇다면 수평 또는 수직의 형태를 그대로 보전하는 작업을 한다.
            var rEdge = me._getREleById(edgeId);
            var vertices, from, to, edge, geometry, fromXY, toXY;

            if (!rEdge) {
                return edgeId;
            }

            edge = rEdge.node;
            geometry = rEdge.node.shape.geom;

            if (!geometry) {
                return edgeId;
            }

            vertices = geometry.getVertices();
            from = $(edge).attr("_from");
            to = $(edge).attr("_to");

            //두 점만으로 이루어진 엣지일 경우는 해당하지 않는다.
            if (vertices.length <= 2) {
                return edgeId;
            }

            if (from) {
                fromXY = me._getPositionFromTerminal(from);
            }

            if (to) {
                toXY = me._getPositionFromTerminal(to);
            }

            if (from) {
                if (vertices[0].x === vertices[1].x) {
                    vertices[1].x = fromXY.x;
                }
                if (vertices[0].y === vertices[1].y) {
                    vertices[1].y = fromXY.y;
                }
            }

            if (to) {
                if (vertices[vertices.length - 1].x === vertices[vertices.length - 2].x) {
                    vertices[vertices.length - 2].x = toXY.x;
                }
                if (vertices[vertices.length - 1].y === vertices[vertices.length - 2].y) {
                    vertices[vertices.length - 2].y = toXY.y;
                }
            }
            edge.shape.geom.setVertices(vertices);

            return edgeId;
        }
    edgeId = $(element).attr("_fromedge");
    if (edgeId) {
        $.each(edgeId.split(","), function (idx, item) {
            if (!excludeEdgeId || excludeEdgeId.toString().indexOf(item) < 0) {
                me.connect($(item).attr('_from'), $(item).attr('_to'), rightAngleCalibration(item))
            }
        });
    }

    edgeId = $(element).attr("_toedge");
    if (edgeId) {
        $.each(edgeId.split(","), function (idx, item) {
            if (!excludeEdgeId || excludeEdgeId.toString().indexOf(item) < 0) {
                me.connect($(item).attr('_from'), $(item).attr('_to'), rightAngleCalibration(item))
            }
        });
    }
};

/**
 * 두개의 터미널을 연결하고, 속성정보에 추가한다.
 *
 * @param {Element,Number[]} from 시작점
 * @param {Element,Number[]} to 끝점
 * @param {Element} edge Edge Shape
 * @param {OG.geometry.Style,Object} style 스타일
 * @param {String} label Label
 * @return {Element} 연결된 Edge 엘리먼트
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.connect = function (from, to, edge, style, label) {

    var rEdge = this._getREleById(OG.Util.isElement(edge) ? edge.id : edge);
    if (rEdge) {
        edge = rEdge.node;
    } else {
        return null;
    }

    var me = this, _style = {}, fromShape, toShape, fromXY, toXY,
        isSelf, beforeEvent, shortestIntersection,
        addAttrValues = function (element, name, value) {
            var attrValue = $(element).attr(name),
                array = attrValue ? attrValue.split(",") : [],
                newArray = [];
            $.each(array, function (idx, item) {
                if (item !== value) {
                    newArray.push(item);
                }
            });
            newArray.push(value);

            $(element).attr(name, newArray.toString());
            return element;
        };

    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {}, me._CONFIG.DEFAULT_STYLE.EDGE);

    if (!from) {
        from = $(edge).attr("_from");
    }
    if (!to) {
        to = $(edge).attr("_to");
    }

    if (from) {
        fromShape = this._getShapeFromTerminal(from);
        fromXY = this._getPositionFromTerminal(from);
    }

    if (to) {
        toShape = this._getShapeFromTerminal(to);
        toXY = this._getPositionFromTerminal(to);
    }

    if (fromShape && toShape) {

        if (fromShape.attributes._shape_id.value == "OG.shape.bpmn.Value_Chain" || toShape.attributes._shape_id.value == "OG.shape.bpmn.Value_Chain") {
            _style["arrow-end"] = "none";
        } else if (fromShape.attributes._shape_id.value == "OG.shape.bpmn.Value_Chain_Module" || toShape.attributes._shape_id.value == "OG.shape.bpmn.Value_Chain_Module") {
            _style["arrow-end"] = "none";
        } else if (fromShape.attributes._shape_id.value == "OG.shape.bpmn.A_HumanTask" || toShape.attributes._shape_id.value == "OG.shape.bpmn.A_HumanTask") {
            _style["edge-type"] = "plain";
            _style["arrow-start"] = "none";
            _style["arrow-end"] = "block-wide-long";
        }

        beforeEvent = jQuery.Event("beforeConnectShape", {edge: edge, fromShape: fromShape, toShape: toShape});
        $(this._PAPER.canvas).trigger(beforeEvent);
        if (beforeEvent.isPropagationStopped()) {
            this.remove(edge);
            return false;
        }
    }

    var geometry = edge.shape.geom;
    var vertices = geometry.getVertices();

    if (from) {
        shortestIntersection =
            fromShape.shape.geom.shortestIntersectToLine([vertices[1], [fromXY.x, fromXY.y]]);

        if (shortestIntersection) {
            vertices[0].x = shortestIntersection.x
            vertices[0].y = shortestIntersection.y
        } else {
            vertices[0].x = fromXY.x
            vertices[0].y = fromXY.y
        }
    }

    if (to) {
        shortestIntersection =
            toShape.shape.geom.shortestIntersectToLine([vertices[vertices.length - 2], [toXY.x, toXY.y]]);

        if (shortestIntersection) {
            vertices[vertices.length - 1].x = shortestIntersection.x
            vertices[vertices.length - 1].y = shortestIntersection.y
        } else {
            vertices[vertices.length - 1].x = toXY.x
            vertices[vertices.length - 1].y = toXY.y
        }
    }

    isSelf = fromShape && toShape && fromShape.id === toShape.id;
    if (isSelf) {
        fromXY = toXY = fromShape.shape.geom.getBoundary().getRightCenter();
    }

    // 라인 드로잉
    edge = this.drawEdge(new OG.PolyLine(vertices), edge.shape.geom.style, edge ? edge.id : null, isSelf);

    // Draw Label
    this.drawLabel(edge, label);
    this.drawEdgeLabel(edge, null, 'FROM');
    this.drawEdgeLabel(edge, null, 'TO');


    // 이전 연결속성정보 삭제
    this.disconnect(edge);

    // 연결 노드 정보 설정
    if (from) {
        $(edge).attr("_from", from);
        addAttrValues(fromShape, "_toedge", edge.id);
    }
    if (to) {
        $(edge).attr("_to", to);
        addAttrValues(toShape, "_fromedge", edge.id);
    }

    if (fromShape && toShape) {
        // connectShape event fire
        $(this._PAPER.canvas).trigger('connectShape', [edge, fromShape, toShape]);
    }

    me.trimEdge(edge);

    return edge;
};


/**
 * 단방향 연결속성정보를 삭제한다. Edge 인 경우에만 해당한다.
 *
 * @param {Element} element
 * @param {String} connectDirection 연결방향 'from' or 'to'
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.disconnectOneWay = function (element, connectDirection) {
    var me = this, fromTerminalId, toTerminalId, fromShape, toShape, fromEdgeId, toEdgeId, fromEdge, toEdge,
        removeAttrValue = function (element, name, value) {
            var attrValue = $(element).attr(name),
                array = attrValue ? attrValue.split(",") : [],
                newArray = [];
            $.each(array, function (idx, item) {
                if (item !== value) {
                    newArray.push(item);
                }
            });

            $(element).attr(name, newArray.toString());
            return element;
        };

    if (element) {
        if ($(element).attr("_shape") === OG.Constants.SHAPE_TYPE.EDGE) {
            // Edge 인 경우 연결된 Shape 의 연결 속성 정보를 삭제
            var fromTerminal = $(element).attr("_from");
            var toTerminal = $(element).attr("_to");

            if (fromTerminal && connectDirection === 'from') {
                fromShape = this._getShapeFromTerminal(fromTerminal);
                removeAttrValue(fromShape, "_toedge", element.id);
                $(element).removeAttr("_from");
            }

            if (toTerminal && connectDirection === 'to') {
                toShape = this._getShapeFromTerminal(toTerminal);
                removeAttrValue(toShape, "_fromedge", element.id);
                $(element).removeAttr("_to");
            }

            // disconnectShape event fire
            if (fromShape && toShape) {
                $(this._PAPER.canvas).trigger('disconnectShape', [element, fromShape, toShape]);
            }
        }
    }
};

/**
 * 연결속성정보를 삭제한다. Edge 인 경우는 연결 속성정보만 삭제하고, 일반 Shape 인 경우는 연결된 모든 Edge 를 삭제한다.
 *
 * @param {Element} element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.disconnect = function (element) {
    var me = this, fromTerminalId, toTerminalId, fromShape, toShape, fromEdgeId, toEdgeId, fromEdge, toEdge,
        removeAttrValue = function (element, name, value) {
            var attrValue = $(element).attr(name),
                array = attrValue ? attrValue.split(",") : [],
                newArray = [];
            $.each(array, function (idx, item) {
                if (item !== value) {
                    newArray.push(item);
                }
            });

            $(element).attr(name, newArray.toString());
            return element;
        };

    if (element) {
        if ($(element).attr("_shape") === OG.Constants.SHAPE_TYPE.EDGE) {
            // Edge 인 경우 연결된 Shape 의 연결 속성 정보를 삭제
            var fromTerminal = $(element).attr("_from");
            var toTerminal = $(element).attr("_to");

            if (fromTerminal) {
                fromShape = this._getShapeFromTerminal(fromTerminal);
                removeAttrValue(fromShape, "_toedge", element.id);
                $(element).removeAttr("_from");
            }

            if (toTerminal) {
                toShape = this._getShapeFromTerminal(toTerminal);
                removeAttrValue(toShape, "_fromedge", element.id);
                $(element).removeAttr("_to");
            }

            // disconnectShape event fire
            if (fromShape && toShape) {
                $(this._PAPER.canvas).trigger('disconnectShape', [element, fromShape, toShape]);
            }
        } else {
            // 일반 Shape 인 경우 연결된 모든 Edge 와 속성 정보를 삭제
            fromEdgeId = $(element).attr("_fromedge");
            toEdgeId = $(element).attr("_toedge");

            if (fromEdgeId) {
                $.each(fromEdgeId.split(","), function (idx, item) {
                    fromEdge = me.getElementById(item);

                    fromTerminalId = $(fromEdge).attr("_from");
                    if (fromTerminalId) {
                        fromShape = me._getShapeFromTerminal(fromTerminalId);
                        removeAttrValue(fromShape, "_toedge", item);
                    }

                    // disconnectShape event fire
                    if (fromShape && element) {
                        $(me._PAPER.canvas).trigger('disconnectShape', [fromEdge, fromShape, element]);
                    }

                    me.remove(fromEdge);
                });
            }

            if (toEdgeId) {
                $.each(toEdgeId.split(","), function (idx, item) {
                    toEdge = me.getElementById(item);

                    toTerminalId = $(toEdge).attr("_to");
                    if (toTerminalId) {
                        toShape = me._getShapeFromTerminal(toTerminalId);
                        removeAttrValue(toShape, "_fromedge", item);
                    }

                    // disconnectShape event fire
                    if (element && toShape) {
                        $(me._PAPER.canvas).trigger('disconnectShape', [toEdge, element, toShape]);
                    }

                    me.remove(toEdge);
                });
            }
        }
    }
};

/**
 * ID에 해당하는 Element 의 Edge 연결시 Drop Over 가이드를 드로잉한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawDropOverGuide = function (element) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        envelope, _upperLeft, _bBoxRect,
        _size = me._CONFIG.GUIDE_RECT_SIZE / 2,
        _hSize = _size / 2;

    if (rElement && geometry && $(element).attr("_shape") !== OG.Constants.SHAPE_TYPE.EDGE && !this._getREleById(rElement.id + OG.Constants.DROP_OVER_BBOX_SUFFIX)) {
        envelope = geometry.getBoundary();
        _upperLeft = envelope.getUpperLeft();

        // guide line 랜더링
        _bBoxRect = this._PAPER.rect(_upperLeft.x - _hSize, _upperLeft.y - _hSize, envelope.getWidth() + _size, envelope.getHeight() + _size);
        _bBoxRect.attr(OG.Util.apply({'stroke-width': _size}, me._CONFIG.DEFAULT_STYLE.DROP_OVER_BBOX));
        this._add(_bBoxRect, rElement.id + OG.Constants.DROP_OVER_BBOX_SUFFIX);

        // layer 위치 조정
        _bBoxRect.insertAfter(rElement);
    }
};

OG.renderer.RaphaelRenderer.prototype.drawGuide = function (element) {

    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        envelope,
        group, guide,
        _bBoxRect, _line, _linePath1, _linePath2,
        _upperLeft, _upperRight, _lowerLeft, _lowerRight, _leftCenter, _upperCenter, _rightCenter, _lowerCenter,
        _ulRect, _urRect, _llRect, _lrRect, _lcRect, _ucRect, _rcRect, _lwcRect, task, end,
        _size = me._CONFIG.GUIDE_RECT_SIZE, _hSize = OG.Util.round(_size / 2),
        _ctrlSize = me._CONFIG.GUIDE_LINE_SIZE,
        _ctrlMargin = me._CONFIG.GUIDE_LINE_MARGIN;

    var createPath = function (x, y) {
        var from = [(_upperRight.x + _ctrlMargin) + x, (_upperRight.y + _ctrlSize - 8) + y];
        var to = [(_upperRight.x + _ctrlMargin) + x + _ctrlSize, (_upperRight.y) + y];
        var path = 'M' + from[0] + ' ' + from[1] + 'L' + to[0] + ' ' + to[1];
        return path;
    }


    if (rElement && geometry) {
        // Edge 인 경우 따로 처리
        if ($(element).attr("_shape") === OG.Constants.SHAPE_TYPE.EDGE) {
            return this.drawEdgeGuide(element);
        } else {
            envelope = geometry.getBoundary();
            _upperLeft = envelope.getUpperLeft();
            _upperRight = envelope.getUpperRight();
            _lowerLeft = envelope.getLowerLeft();
            _lowerRight = envelope.getLowerRight();
            _leftCenter = envelope.getLeftCenter();
            _upperCenter = envelope.getUpperCenter();
            _rightCenter = envelope.getRightCenter();
            _lowerCenter = envelope.getLowerCenter();


            if (this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.GUIDE)) {
                // 가이드가 이미 존재하는 경우에는 bBox 만 삭제후 새로 draw
                // bBox remove -> redraw
                this._remove(this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX));
                _bBoxRect = this._PAPER.rect(_upperLeft.x, _upperLeft.y, envelope.getWidth(), envelope.getHeight());
                _bBoxRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_BBOX);
                this._add(_bBoxRect, rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX);
                _bBoxRect.insertBefore(rElement);

                _ulRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.UL);
                _urRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.UR);
                _llRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.LL);
                _lrRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.LR);
                _lcRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.LC);
                _ucRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.UC);
                _rcRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.RC);
                _lwcRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.LWC);

                _ulRect.attr({x: _upperLeft.x - _hSize, y: _upperLeft.y - _hSize});
                _urRect.attr({x: _upperRight.x - _hSize, y: _upperRight.y - _hSize});
                _llRect.attr({x: _lowerLeft.x - _hSize, y: _lowerLeft.y - _hSize});
                _lrRect.attr({x: _lowerRight.x - _hSize, y: _lowerRight.y - _hSize});
                _lcRect.attr({x: _leftCenter.x - _hSize, y: _leftCenter.y - _hSize});
                _ucRect.attr({x: _upperCenter.x - _hSize, y: _upperCenter.y - _hSize});
                _rcRect.attr({x: _rightCenter.x - _hSize, y: _rightCenter.y - _hSize});
                _lwcRect.attr({x: _lowerCenter.x - _hSize, y: _lowerCenter.y - _hSize});

                _line = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.LINE);
                _linePath1 = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.LINE + '1');
                _linePath2 = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.LINE + '2');
                _line.attr({x: _upperRight.x + _ctrlMargin, y: _upperRight.y});
                _linePath1.attr({'path': createPath(0, 0)});
                _linePath2.attr({'path': createPath(0, 8)});

                return null;
            }

            // group
            group = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.GUIDE);
            if (group) {
                this._remove(group);
                this._remove(this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX));
            }
            group = this._PAPER.group();

            // guide line 랜더링
            _bBoxRect = this._PAPER.rect(_upperLeft.x, _upperLeft.y, envelope.getWidth(), envelope.getHeight());
            _ulRect = this._PAPER.rect(_upperLeft.x - _hSize, _upperLeft.y - _hSize, _size, _size);
            _urRect = this._PAPER.rect(_upperRight.x - _hSize, _upperRight.y - _hSize, _size, _size);
            _llRect = this._PAPER.rect(_lowerLeft.x - _hSize, _lowerLeft.y - _hSize, _size, _size);
            _lrRect = this._PAPER.rect(_lowerRight.x - _hSize, _lowerRight.y - _hSize, _size, _size);
            _lcRect = this._PAPER.rect(_leftCenter.x - _hSize, _leftCenter.y - _hSize, _size, _size);
            _ucRect = this._PAPER.rect(_upperCenter.x - _hSize, _upperCenter.y - _hSize, _size, _size);
            _rcRect = this._PAPER.rect(_rightCenter.x - _hSize, _rightCenter.y - _hSize, _size, _size);
            _lwcRect = this._PAPER.rect(_lowerCenter.x - _hSize, _lowerCenter.y - _hSize, _size, _size);

            _bBoxRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_BBOX);
            _ulRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_UL);
            _urRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_UR);
            _llRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_LL);
            _lrRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_LR);
            _lcRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_LC);
            _ucRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_UC);
            _rcRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_RC);
            _lwcRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_LWC);


            _line = this._PAPER.rect(_upperRight.x + _ctrlMargin, _upperRight.y, _ctrlSize, _ctrlSize);
            _linePath1 = this._PAPER.path(createPath(0, 0));
            _linePath2 = this._PAPER.path(createPath(0, 8));
            _line.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_LINE_AREA);
            _linePath1.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_LINE);
            _linePath2.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_LINE);
            _linePath2.attr({'stroke-dasharray': '-'});


            // add to Group
            group.appendChild(_ulRect);
            group.appendChild(_urRect);
            group.appendChild(_llRect);
            group.appendChild(_lrRect);
            group.appendChild(_lcRect);
            group.appendChild(_ucRect);
            group.appendChild(_rcRect);
            group.appendChild(_lwcRect);

            group.appendChild(_linePath1);
            group.appendChild(_linePath2);
            group.appendChild(_line);


            this._add(group, rElement.id + OG.Constants.GUIDE_SUFFIX.GUIDE);
            this._add(_bBoxRect, rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX);
            this._add(_ulRect, rElement.id + OG.Constants.GUIDE_SUFFIX.UL);
            this._add(_urRect, rElement.id + OG.Constants.GUIDE_SUFFIX.UR);
            this._add(_llRect, rElement.id + OG.Constants.GUIDE_SUFFIX.LL);
            this._add(_lrRect, rElement.id + OG.Constants.GUIDE_SUFFIX.LR);
            this._add(_lcRect, rElement.id + OG.Constants.GUIDE_SUFFIX.LC);
            this._add(_ucRect, rElement.id + OG.Constants.GUIDE_SUFFIX.UC);
            this._add(_rcRect, rElement.id + OG.Constants.GUIDE_SUFFIX.RC);
            this._add(_lwcRect, rElement.id + OG.Constants.GUIDE_SUFFIX.LWC);

            this._add(_line, rElement.id + OG.Constants.GUIDE_SUFFIX.LINE);
            this._add(_linePath1, rElement.id + OG.Constants.GUIDE_SUFFIX.LINE + '1');
            this._add(_linePath2, rElement.id + OG.Constants.GUIDE_SUFFIX.LINE + '2');

            guide = {
                bBox: _bBoxRect.node,
                group: group.node,
                ul: _ulRect.node,
                ur: _urRect.node,
                ll: _llRect.node,
                lr: _lrRect.node,
                lc: _lcRect.node,
                uc: _ucRect.node,
                rc: _rcRect.node,
                lwc: _lwcRect.node,
                line: _line.node
            };

            // layer 위치 조정
            _bBoxRect.insertBefore(rElement);
            group.insertAfter(rElement);

            // selected 속성값 설정
            $(rElement.node).attr("_selected", "true");

            return guide;
        }
    }

    return null;
};

/**
 * ID에 해당하는 Element 의 Stick 용 가이드를 드로잉한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Object}
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawStickGuide = function (element, toBeStuck, vertical) {

    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        envelope,
        group, guide,
        _bBoxRect,
        _upperLeft, _upperRight, _lowerLeft, _lowerRight, _leftCenter, _upperCenter, _rightCenter, _lowerCenter,
        _ulRect, _urRect, _llRect, _lrRect, _lcRect, _ucRect, _rcRect, _lwcRect, task, end,
        _size = me._CONFIG.GUIDE_RECT_SIZE, _hSize = OG.Util.round(_size / 2);

    if (rElement && geometry) {
        // Edge 인 경우 따로 처리
        if ($(element).attr("_shape") === OG.Constants.SHAPE_TYPE.EDGE) {
            return this.drawEdgeGuide(element);
        } else {
            envelope = geometry.getBoundary();
            _upperLeft = envelope.getUpperLeft();
            _upperRight = envelope.getUpperRight();
            _lowerLeft = envelope.getLowerLeft();
            _lowerRight = envelope.getLowerRight();
            _leftCenter = envelope.getLeftCenter();
            _upperCenter = envelope.getUpperCenter();
            _rightCenter = envelope.getRightCenter();
            _lowerCenter = envelope.getLowerCenter();


            this.removeStickGuide(vertical);


            var path;

            if (vertical) {
                path = this._PAPER.path("M" + _upperCenter.x + ",0L" + _upperCenter.x + ",10000");
            } else {
                path = this._PAPER.path("M0," + _leftCenter.y + "L10000," + _leftCenter.y);
            }

            path.attr("stroke-width", "2");
            path.attr("stroke", "#FFCC50");
            //path.attr ("stroke-dasharray", '--');

            if (vertical)
                this._stickGuideX = path;
            else
                this._stickGuideY = path;

            return null;
        }
    }
    return null;
};

OG.renderer.RaphaelRenderer.prototype.removeStickGuide = function (vertical) {

    if (vertical) {
        if (this._stickGuideX) {
            this._remove(this._stickGuideX);
            this._stickGuideX = null;
        }
    } else {
        if (this._stickGuideY) {
            this._remove(this._stickGuideY);
            this._stickGuideY = null;
        }
    }

}

/**
 * ID에 해당하는 Element 의 Move & Resize 용 가이드를 제거한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.removeGuide = function (element) {

    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        guide = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.GUIDE),
        bBox = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX);

    rElement.node.removeAttribute("_selected");
    this._remove(guide);
    this._remove(bBox);

    this.removeStickGuide(true);
    this.removeStickGuide(false);
};

/**
 * 모든 Move & Resize 용 가이드를 제거한다.
 *
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.removeAllGuide = function () {
    var me = this;
    $(me.getRootElement()).find("[_type=" + OG.Constants.NODE_TYPE.SHAPE + "][_selected=true]").each(function (index, item) {
        if (OG.Util.isElement(item) && item.id) {
            me.removeGuide(item);
        }
    });
};

/**
 * ID에 해당하는 Edge Element 의 Move & Resize 용 가이드를 드로잉한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Object}
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawEdgeGuide = function (element) {
    return null;

    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        vertices, isSelf,
        group, guide, pathStr,
        _bBoxLine, _fromRect, _toRect, _controlRect, controlNode = [],
        _size = me._CONFIG.GUIDE_RECT_SIZE, _hSize = OG.Util.round(_size / 2), _style = {},
        i;

    if (rElement && geometry) {
        OG.Util.apply(_style, geometry.style.map, me._CONFIG.DEFAULT_STYLE.EDGE);

        vertices = _style["edge-type"] === OG.Constants.EDGE_TYPE.BEZIER ? geometry.getControlPoints() : geometry.getVertices();

        isSelf = $(element).attr("_from") && $(element).attr("_to") && $(element).attr("_from") === $(element).attr("_to");

        if (this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.GUIDE)) {
            // 가이드가 이미 존재하는 경우에는 bBoxLine 만 삭제후 새로 draw 하고 나머지 guide 는 Update 한다.
            // bBoxLine remove -> redraw
            this._remove(this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX));
            pathStr = "";
            if (_style["edge-type"] === OG.Constants.EDGE_TYPE.BEZIER) {
                for (i = 0; i < vertices.length; i++) {
                    if (i === 0) {
                        pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                    } else if (i === 1) {
                        pathStr += "C" + vertices[i].x + " " + vertices[i].y;
                    } else {
                        pathStr += " " + vertices[i].x + " " + vertices[i].y;
                    }
                }
            } else {
                for (i = 0; i < vertices.length; i++) {
                    if (i === 0) {
                        pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                    } else {
                        pathStr += "L" + vertices[i].x + " " + vertices[i].y;
                    }
                }
            }

            _bBoxLine = this._PAPER.path(pathStr);
            _bBoxLine.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_BBOX);
            this._add(_bBoxLine, rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX);
            _bBoxLine.insertBefore(rElement);

            // 시작지점 가이드 Update
            _fromRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.FROM);
            _fromRect.attr({x: vertices[0].x - _hSize, y: vertices[0].y - _hSize});

            // 종료지점 가이드 Update
            _toRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.TO);
            _toRect.attr({x: vertices[vertices.length - 1].x - _hSize, y: vertices[vertices.length - 1].y - _hSize});

            // 콘트롤 가이드 Update
            if (!isSelf && _style["edge-type"] !== OG.Constants.EDGE_TYPE.BEZIER) {
                for (i = 1; i < vertices.length - 2; i++) {
                    if (vertices[i].x === vertices[i + 1].x) {
                        _controlRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.CTL_H + i);
                        if (_controlRect) {
                            _controlRect.attr({
                                x: vertices[i].x - _hSize,
                                y: OG.Util.round((vertices[i].y + vertices[i + 1].y) / 2) - _hSize
                            });
                        }
                    } else {
                        _controlRect = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.CTL_V + i);
                        if (_controlRect) {
                            _controlRect.attr({
                                x: OG.Util.round((vertices[i].x + vertices[i + 1].x) / 2) - _hSize,
                                y: vertices[i].y - _hSize
                            });
                        }
                    }
                }
            }

            return null;
        }

        // group
        group = this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.GUIDE);
        if (group) {
            this._remove(group);
            this._remove(this._getREleById(rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX));
        }
        group = this._PAPER.group();

        // 쉐도우 가이드
        pathStr = "";
        if (_style["edge-type"] === OG.Constants.EDGE_TYPE.BEZIER) {
            for (i = 0; i < vertices.length; i++) {
                if (i === 0) {
                    pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                } else if (i === 1) {
                    pathStr += "C" + vertices[i].x + " " + vertices[i].y;
                } else {
                    pathStr += " " + vertices[i].x + " " + vertices[i].y;
                }
            }
        } else {
            for (i = 0; i < vertices.length; i++) {
                if (i === 0) {
                    pathStr = "M" + vertices[i].x + " " + vertices[i].y;
                } else {
                    pathStr += "L" + vertices[i].x + " " + vertices[i].y;
                }
            }
        }
        _bBoxLine = this._PAPER.path(pathStr);
        _bBoxLine.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_BBOX);

        // 시작지점 가이드
        _fromRect = this._PAPER.rect(vertices[0].x - _hSize, vertices[0].y - _hSize, _size, _size);
        _fromRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_FROM);
        group.appendChild(_fromRect);
        this._add(_fromRect, rElement.id + OG.Constants.GUIDE_SUFFIX.FROM);

        // 종료지점 가이드
        _toRect = this._PAPER.rect(vertices[vertices.length - 1].x - _hSize, vertices[vertices.length - 1].y - _hSize, _size, _size);
        _toRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_TO);
        group.appendChild(_toRect);
        this._add(_toRect, rElement.id + OG.Constants.GUIDE_SUFFIX.TO);

        // 콘트롤 가이드
        if (!isSelf && _style["edge-type"] !== OG.Constants.EDGE_TYPE.BEZIER) {
            for (i = 1; i < vertices.length - 2; i++) {
                if (vertices[i].x === vertices[i + 1].x) {
                    _controlRect = this._PAPER.rect(vertices[i].x - _hSize,
                        OG.Util.round((vertices[i].y + vertices[i + 1].y) / 2) - _hSize, _size, _size);
                    _controlRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_CTL_H);
                    this._add(_controlRect, rElement.id + OG.Constants.GUIDE_SUFFIX.CTL_H + i);
                } else {
                    _controlRect = this._PAPER.rect(OG.Util.round((vertices[i].x + vertices[i + 1].x) / 2) - _hSize,
                        vertices[i].y - _hSize, _size, _size);
                    _controlRect.attr(me._CONFIG.DEFAULT_STYLE.GUIDE_CTL_V);
                    this._add(_controlRect, rElement.id + OG.Constants.GUIDE_SUFFIX.CTL_V + i);
                }
                group.appendChild(_controlRect);
                controlNode.push(_controlRect.node);
            }
        }
        this._add(_bBoxLine, rElement.id + OG.Constants.GUIDE_SUFFIX.BBOX);
        this._add(group, rElement.id + OG.Constants.GUIDE_SUFFIX.GUIDE);

        // guide 정의
        guide = {
            bBox: _bBoxLine.node,
            group: group.node,
            from: _fromRect.node,
            to: _toRect.node,
            controls: controlNode
        };

        // layer 위치 조정
        _bBoxLine.insertBefore(rElement);
        group.insertAfter(rElement);

        // selected 속성값 설정
        $(rElement.node).attr("_selected", "true");

        return guide;
    }

    return null;
};

/**
 * Rectangle 모양의 마우스 드래그 선택 박스 영역을 드로잉한다.
 *
 * @param {Number[]} position 드로잉할 위치 좌표(좌상단)
 * @param {Number[]} size Text Width, Height, Angle
 * @param {OG.geometry.Style,Object} style 스타일
 * @return {Element} DOM Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawRubberBand = function (position, size, style) {
    var me = this, x = position ? position[0] : 0,
        y = position ? position[1] : 0,
        width = size ? size[0] : 0,
        height = size ? size[1] : 0,
        rect = this._getREleById(OG.Constants.RUBBER_BAND_ID),
        _style = {};
    if (rect) {
        rect.attr({
            x: x,
            y: y,
            width: Math.abs(width),
            height: Math.abs(height)
        });
        return rect;
    }
    OG.Util.apply(_style, (style instanceof OG.geometry.Style) ? style.map : style || {}, me._CONFIG.DEFAULT_STYLE.RUBBER_BAND);
    rect = this._PAPER.rect(x, y, width, height).attr(_style);
    this._add(rect, OG.Constants.RUBBER_BAND_ID);
    this._ETC_GROUP.node.appendChild(rect.node);

    return rect.node;
};

/**
 * Rectangle 모양의 마우스 드래그 선택 박스 영역을 제거한다.
 *
 * @param {Element} root first, rubberBand 정보를 저장한 엘리먼트
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.removeRubberBand = function (root) {
    this.setAttr(OG.Constants.RUBBER_BAND_ID, {x: 0, y: 0, width: 0, height: 0});
    $(root).removeData("dragBox_first");
    $(root).removeData("rubberBand");
};

/**
 * ID에 해당하는 Element 의 Collapse 가이드를 드로잉한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Element}
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.drawCollapseGuide = function (element) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        envelope, _upperLeft, _bBoxRect, _rect, _rect1,
        _size = me._CONFIG.COLLAPSE_SIZE,
        _hSize = _size / 2;

    if (rElement && geometry && $(element).attr("_shape") === OG.Constants.SHAPE_TYPE.GROUP) {
        _bBoxRect = this._getREleById(rElement.id + OG.Constants.COLLAPSE_BBOX_SUFFIX);
        if (_bBoxRect) {
            this._remove(_bBoxRect);
        }
        _rect = this._getREleById(rElement.id + OG.Constants.COLLAPSE_SUFFIX);
        if (_rect) {
            this._remove(_rect);
        }

        envelope = geometry.getBoundary();
        _upperLeft = envelope.getUpperLeft();

        // hidden box
        _bBoxRect = this._PAPER.rect(envelope.getUpperLeft().x - _size, envelope.getUpperLeft().y - _size,
            envelope.getWidth() + _size * 2, envelope.getHeight() + _size * 2);
        _bBoxRect.attr(me._CONFIG.DEFAULT_STYLE.COLLAPSE_BBOX);
        this._add(_bBoxRect, rElement.id + OG.Constants.COLLAPSE_BBOX_SUFFIX);

        if (rElement.node.shape.isCollapsed === true) {
            // expand 랜더링
            _rect = this._PAPER.path(
                "M" + (_upperLeft.x + _hSize) + " " + (_upperLeft.y + _hSize) +
                "h" + _size + "v" + _size + "h" + (-1 * _size) + "v" + (-1 * _size) +
                "m1 " + _hSize + "h" + (_size - 2) + "M" +
                (_upperLeft.x + _hSize) + " " + (_upperLeft.y + _hSize) +
                "m" + _hSize + " 1v" + (_size - 2)
            );
        } else {
            // collapse 랜더링
            _rect = this._PAPER.path("M" + (_upperLeft.x + _hSize) + " " +
                (_upperLeft.y + _hSize) + "h" + _size + "v" + _size + "h" + (-1 * _size) + "v" + (-1 * _size) +
                "m1 " + _hSize + "h" + (_size - 2));
        }

        _rect.attr(me._CONFIG.DEFAULT_STYLE.COLLAPSE);
        this._add(_rect, rElement.id + OG.Constants.COLLAPSE_SUFFIX);

        // layer 위치 조정
        _bBoxRect.insertBefore(rElement);
        _rect.insertAfter(rElement);

        return {
            bBox: _bBoxRect.node,
            collapse: _rect.node
        };
    }

    return null;
};


/**
 * ID에 해당하는 Element 의 Collapse 가이드를 제거한다.
 *
 * @param {Element} element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.removeCollapseGuide = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        _bBoxRect, _rect;

    if (rElement) {
        _bBoxRect = this._getREleById(rElement.id + OG.Constants.COLLAPSE_BBOX_SUFFIX);
        if (_bBoxRect) {
            this._remove(_bBoxRect);
        }
        _rect = this._getREleById(rElement.id + OG.Constants.COLLAPSE_SUFFIX);
        if (_rect) {
            this._remove(_rect);
        }
    }
};

/**
 * 주어진 Shape 들을 그룹핑한다.
 *
 * @param {Element[]} elements
 * @return {Element} Group Shape Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.group = function (elements) {
    var groupShapeEle, geometryArray = [], geometryCollection, envelope, position, shape, size, i;

    if (elements && elements.length > 1) {
        // 그룹핑할 Shape 의 전체 영역 계산
        for (i = 0; i < elements.length; i++) {
            geometryArray.push(elements[i].shape.geom);
        }
        geometryCollection = new OG.GeometryCollection(geometryArray);
        envelope = geometryCollection.getBoundary();

        // 위치 및 사이즈 설정
        position = [envelope.getCentroid().x, envelope.getCentroid().y];
        shape = new OG.GroupShape();
        size = [envelope.getWidth(), envelope.getHeight()];

        // draw group
        groupShapeEle = this.drawShape(position, shape, size);

        // append child
        for (i = 0; i < elements.length; i++) {
            groupShapeEle.appendChild(elements[i]);
        }

        // group event fire
        $(this._PAPER.canvas).trigger('group', [groupShapeEle]);
    }

    return groupShapeEle;
};

/**
 * 주어진 그룹들을 그룹해제한다.
 *
 * @param {Element[]} groupElements
 * @return {Element[]} ungrouped Elements
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.ungroup = function (groupElements) {
    var ungroupElements = [], children, i, j;
    if (groupElements && groupElements.length > 0) {
        for (i = 0; i < groupElements.length; i++) {
            children = $(groupElements[i]).children("[_type='" + OG.Constants.NODE_TYPE.SHAPE + "']");
            for (j = 0; j < children.length; j++) {
                groupElements[i].parentNode.appendChild(children[j]);
                ungroupElements.push(children[j]);
            }
            this.removeShape(groupElements[i]);
        }

        // ungroup event fire
        $(this._PAPER.canvas).trigger('ungroup', [ungroupElements]);
    }

    return ungroupElements;
};

/**
 * 주어진 Shape 들을 그룹에 추가한다.
 *
 * @param {Element} groupElement
 * @param {Element[]} elements
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.addToGroup = function (groupElement, elements) {
    var i;
    for (i = 0; i < elements.length; i++) {
        groupElement.appendChild(elements[i]);
    }
};

/**
 * 주어진 Shape 이 그룹인 경우 collapse 한다.
 *
 * @param {Element} element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.collapse = function (element) {
    var me = this, childNodes, i, hideChildEdge;

    hideChildEdge = function (_collapseRootElement, _element) {
        var edgeIdArray, fromEdge, toEdge, _childNodes = _element.childNodes, otherShape, i, j, isNeedToRedraw;
        for (i = _childNodes.length - 1; i >= 0; i--) {
            if ($(_childNodes[i]).attr("_type") === OG.Constants.NODE_TYPE.SHAPE) {
                hideChildEdge(_collapseRootElement, _childNodes[i]);

                isNeedToRedraw = false;
                edgeIdArray = $(_childNodes[i]).attr("_fromedge");
                if (edgeIdArray) {
                    edgeIdArray = edgeIdArray.split(",");
                    for (j = 0; j < edgeIdArray.length; j++) {
                        fromEdge = me.getElementById(edgeIdArray[j]);
                        if (fromEdge) {
                            otherShape = me._getShapeFromTerminal($(fromEdge).attr("_from"));

                            // otherShape 이 같은 collapse 범위내에 있는지 체크
                            if ($(otherShape).parents("#" + _collapseRootElement.id).length !== 0) {
                                me.hide(fromEdge);
                            } else {
                                isNeedToRedraw = true;
                            }
                        }
                    }
                }

                edgeIdArray = $(_childNodes[i]).attr("_toedge");
                if (edgeIdArray) {
                    edgeIdArray = edgeIdArray.split(",");
                    for (j = 0; j < edgeIdArray.length; j++) {
                        toEdge = me.getElementById(edgeIdArray[j]);
                        if (toEdge) {
                            otherShape = me._getShapeFromTerminal($(toEdge).attr("_to"));

                            // otherShape 이 같은 collapse 범위내에 있는지 체크
                            if ($(otherShape).parents("#" + _collapseRootElement.id).length !== 0) {
                                me.hide(toEdge);
                            } else {
                                isNeedToRedraw = true;
                            }
                        }
                    }
                }

                // group 영역 밖의 연결된 otherShape 이 있는 경우 redrawConnectedEdge
                if (isNeedToRedraw === true) {
                    me.redrawConnectedEdge(_childNodes[i]);
                }
            }
        }
    };

    if (element.shape) {
        childNodes = element.childNodes;
        for (i = childNodes.length - 1; i >= 0; i--) {
            if ($(childNodes[i]).attr("_type") === OG.Constants.NODE_TYPE.SHAPE) {
                this.hide(childNodes[i]);
            }
        }
        element.shape.isCollapsed = true;
        $(element).attr("_collapsed", true);

        hideChildEdge(element, element);
        this.redrawShape(element);

        // collapsed event fire
        $(this._PAPER.canvas).trigger('collapsed', [element]);
    }
};

/**
 * 주어진 Shape 이 그룹인 경우 expand 한다.
 *
 * @param {Element} element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.expand = function (element) {
    var me = this, childNodes, i, showChildEdge;

    showChildEdge = function (_collapseRootElement, _element) {
        var edgeIdArray, fromEdge, toEdge, _childNodes = _element.childNodes, otherShape, i, j, isNeedToRedraw;
        for (i = _childNodes.length - 1; i >= 0; i--) {
            if ($(_childNodes[i]).attr("_type") === OG.Constants.NODE_TYPE.SHAPE) {
                showChildEdge(_collapseRootElement, _childNodes[i]);

                isNeedToRedraw = false;
                edgeIdArray = $(_childNodes[i]).attr("_fromedge");
                if (edgeIdArray) {
                    edgeIdArray = edgeIdArray.split(",");
                    for (j = 0; j < edgeIdArray.length; j++) {
                        fromEdge = me.getElementById(edgeIdArray[j]);
                        if (fromEdge) {
                            otherShape = me._getShapeFromTerminal($(fromEdge).attr("_from"));

                            // otherShape 이 같은 collapse 범위내에 있는지 체크
                            if ($(otherShape).parents("#" + _collapseRootElement.id).length !== 0) {
                                me.show(fromEdge);
                            } else {
                                isNeedToRedraw = true;
                            }
                        }
                    }
                }

                edgeIdArray = $(_childNodes[i]).attr("_toedge");
                if (edgeIdArray) {
                    edgeIdArray = edgeIdArray.split(",");
                    for (j = 0; j < edgeIdArray.length; j++) {
                        toEdge = me.getElementById(edgeIdArray[j]);
                        if (toEdge) {
                            otherShape = me._getShapeFromTerminal($(toEdge).attr("_to"));

                            // otherShape 이 같은 collapse 범위내에 있는지 체크
                            if ($(otherShape).parents("#" + _collapseRootElement.id).length !== 0) {
                                me.show(toEdge);
                            } else {
                                isNeedToRedraw = true;
                            }
                        }
                    }
                }

                // group 영역 밖의 연결된 otherShape 이 있는 경우 redrawConnectedEdge
                if (isNeedToRedraw === true) {
                    me.redrawConnectedEdge(_childNodes[i]);
                }
            }
        }
    };

    if (element.shape) {
        childNodes = element.childNodes;
        for (i = childNodes.length - 1; i >= 0; i--) {
            if ($(childNodes[i]).attr("_type") === OG.Constants.NODE_TYPE.SHAPE) {
                this.show(childNodes[i]);
            }
        }
        element.shape.isCollapsed = false;
        $(element).attr("_collapsed", false);

        showChildEdge(element, element);
        this.redrawShape(element);

        // expanded event fire
        $(this._PAPER.canvas).trigger('expanded', [element]);
    }
};

/**
 * 드로잉된 모든 오브젝트를 클리어한다.
 *
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.clear = function () {
    this._PAPER.clear();
    this._ELE_MAP.clear();
    this._ID_PREFIX = Math.round(Math.random() * 10000);
    this._LAST_ID = 0;
    this._ROOT_GROUP = this._add(this._PAPER.group(), null, OG.Constants.NODE_TYPE.ROOT);
    this._ETC_GROUP = this._add(this._PAPER.group(), null, OG.Constants.NODE_TYPE.ETC);
};

OG.renderer.RaphaelRenderer.prototype.alignLeft = function () {
    var minX = 0, me = this;
    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        if (minX == 0) {
            minX = item.shape.geom.boundary._leftCenter.x;
        } else {
            minX = minX > item.shape.geom.boundary._leftCenter.x ? item.shape.geom.boundary._leftCenter.x : minX;
        }
    });
    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        me.move(item, [minX - item.shape.geom.boundary._leftCenter.x, 0]);
        me.drawGuide(item);
    });

    me._CANVAS._HANDLER.selectShapes(me._CANVAS._HANDLER._getSelectedElement());
};

OG.renderer.RaphaelRenderer.prototype.alignRight = function () {
    var maxX = 0, me = this;
    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        if (maxX == 0) {
            maxX = item.shape.geom.boundary._rightCenter.x;
        } else {
            maxX = maxX < item.shape.geom.boundary._rightCenter.x ? item.shape.geom.boundary._rightCenter.x : maxX;
        }
    });

    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        me.move(item, [maxX - item.shape.geom.boundary._rightCenter.x, 0]);
        me.drawGuide(item);
    });

    me._CANVAS._HANDLER.selectShapes(me._CANVAS._HANDLER._getSelectedElement());
};

OG.renderer.RaphaelRenderer.prototype.alignBottom = function () {
    var maxY = 0, me = this;
    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        if (maxY == 0) {
            maxY = item.shape.geom.boundary._leftCenter.y;
        } else {
            maxY = maxY < item.shape.geom.boundary._leftCenter.y ? item.shape.geom.boundary._leftCenter.y : maxY;
        }
    });

    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        me.move(item, [0, maxY - item.shape.geom.boundary._leftCenter.y]);
        me.drawGuide(item);
    });

    me._CANVAS._HANDLER.selectShapes(me._CANVAS._HANDLER._getSelectedElement());
};

OG.renderer.RaphaelRenderer.prototype.alignTop = function () {
    var minY = 0, me = this;
    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        if (minY == 0) {
            minY = item.shape.geom.boundary._rightCenter.y;
        } else {
            minY = minY > item.shape.geom.boundary._rightCenter.y ? item.shape.geom.boundary._rightCenter.y : minY;
        }
    });

    $(me.getRootElement()).find("[_selected=true]").each(function (idx, item) {
        if (item.shape.TYPE == 'EDGE')
            return;

        me.move(item, [0, minY - item.shape.geom.boundary._rightCenter.y]);
        me.drawGuide(item);
    });

    me._CANVAS._HANDLER.selectShapes(me._CANVAS._HANDLER._getSelectedElement());
};

/**
 * Shape 을 캔버스에서 관련된 모두를 삭제한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.removeShape = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        childNodes, beforeEvent, i, removedElement;
    childNodes = rElement.node.childNodes;

    beforeEvent = jQuery.Event("beforeRemoveShape", {element: rElement.node});
    $(this._PAPER.canvas).trigger(beforeEvent);
    if (beforeEvent.isPropagationStopped()) {
        return false;
    }

    for (i = childNodes.length - 1; i >= 0; i--) {
        if ($(childNodes[i]).attr("_type") === OG.Constants.NODE_TYPE.SHAPE) {
            this.removeShape(childNodes[i]);
        }
    }

    this.disconnect(rElement.node);
    this.removeGuide(rElement.node);
    this.removeCollapseGuide(rElement.node);

    removedElement = OG.Util.clone(rElement.node);

    this.remove(rElement.node);

    // removeShape event fire
    $(this._PAPER.canvas).trigger('removeShape', [removedElement]);
    $(this._PAPER.canvas).trigger('change');
};

/**
 * ID에 해당하는 Element 를 캔버스에서 제거한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.remove = function (element) {
    var id = OG.Util.isElement(element) ? element.id : element,
        rElement = this._getREleById(id);
    this._remove(rElement);
};

/**
 * 하위 엘리먼트만 제거한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.removeChild = function (element) {
    var id = OG.Util.isElement(element) ? element.id : element,
        rElement = this._getREleById(id);
    this._removeChild(rElement);
};

/**
 * 랜더러 캔버스 Root Element 를 반환한다.
 *
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getRootElement = function () {
    return this._PAPER.canvas;
};

/**
 * 주어진 지점을 포함하는 Top Element 를 반환한다.
 *
 * @param {Number[]} position 위치 좌표
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getElementByPoint = function (position) {
    var element = this._PAPER.getElementByPoint(position[0], position[1]);
    return element ? element.node.parentNode : null;
};


/**
 * 엘리먼트에 속성값을 설정한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Object} attribute 속성값
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.setAttr = function (element, attribute) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        rElement.attr(attribute);
    }
};

/**
 * 엘리먼트 속성값을 반환한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {String} attrName 속성이름
 * @return {Object} attribute 속성값
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getAttr = function (element, attrName) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        return rElement.attr(attrName);
    }
    return null;
};

/**
 * Shape 의 스타일을 변경한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Object} style 스타일
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.setShapeStyle = function (element, style) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement && element.shape && element.shape.geom) {
        OG.Util.apply(element.shape.geom.style.map, style || {});
        element.shapeStyle = element.shapeStyle || {};
        OG.Util.apply(element.shapeStyle, style || {});
        this.redrawShape(element);
    }
};

/**
 * ID에 해당하는 Element 를 최상단 레이어로 이동한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.toFront = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        rElement.toFront();
    }
};

/**
 * ID에 해당하는 Element 를 최하단 레이어로 이동한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.toBack = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        rElement.toBack();
    }
};

/**
 * 랜더러 캔버스의 사이즈(Width, Height)를 반환한다.
 *
 * @return {Number[]} Canvas Width, Height
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getCanvasSize = function () {
    return [this._PAPER.width, this._PAPER.height];
};

/**
 * 랜더러 캔버스의 사이즈(Width, Height)를 변경한다.
 *
 * @param {Number[]} size Canvas Width, Height
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.setCanvasSize = function (size) {
    this._PAPER.setSize(size[0], size[1]);
};

/**
 * 랜더러 캔버스의 사이즈(Width, Height)를 실제 존재하는 Shape 의 영역에 맞게 변경한다.
 *
 * @param {Number[]} minSize Canvas 최소 Width, Height
 * @param {Boolean} fitScale 주어진 minSize 에 맞게 fit 여부(Default:false)
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.fitCanvasSize = function (minSize, fitScale) {
    var me = this, realRootBBox = this.getRealRootBBox(), offsetX, offsetY, scale = 1,
        width = realRootBBox.width + me._CONFIG.FIT_CANVAS_PADDING * 2,
        height = realRootBBox.height + me._CONFIG.FIT_CANVAS_PADDING * 2;
    if (realRootBBox.width !== 0 && realRootBBox.height !== 0) {
        offsetX = realRootBBox.x > me._CONFIG.FIT_CANVAS_PADDING ?
        -1 * (realRootBBox.x - me._CONFIG.FIT_CANVAS_PADDING) : me._CONFIG.FIT_CANVAS_PADDING - realRootBBox.x;
        offsetY = realRootBBox.y > me._CONFIG.FIT_CANVAS_PADDING ?
        -1 * (realRootBBox.y - me._CONFIG.FIT_CANVAS_PADDING) : me._CONFIG.FIT_CANVAS_PADDING - realRootBBox.y;

        this.move(this.getRootGroup(), [offsetX, offsetY]);
        this.removeAllGuide();

        if (minSize && minSize.length === 2) {
            if (OG.Util.isDefined(fitScale) && fitScale === true) {
                scale = minSize[0] / width > minSize[1] / height ? minSize[1] / height : minSize[0] / width;
            }

            width = width < minSize[0] ? minSize[0] : width;
            height = height < minSize[1] ? minSize[1] : height;
        }
        this.setScale(OG.Util.roundPrecision(scale, 1));
        this.setCanvasSize([width, height]);
    }
};

/**
 * 새로운 View Box 영역을 설정한다. (ZoomIn & ZoomOut 가능)
 *
 * @param {Number[]} position 위치 좌표(좌상단 기준)
 * @param {Number[]} size Canvas Width, Height
 * @param {Boolean} isFit Fit 여부
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.setViewBox = function (position, size, isFit) {
    this._PAPER.setViewBox(position[0], position[1], size[0], size[1], isFit);
};

/**
 * Scale 을 반환한다. (리얼 사이즈 : Scale = 1)
 *
 * @return {Number} 스케일값
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getScale = function (scale) {
    var me = this;
    return me._CONFIG.SCALE;
};

/**
 * Scale 을 설정한다. (리얼 사이즈 : Scale = 1)
 *
 * @param {Number} scale 스케일값
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.setScale = function (scale) {
    var me = this;
    if (me._CONFIG.SCALE_MIN <= scale && scale <= me._CONFIG.SCALE_MAX) {
        if (this.isVML()) {
            // TODO : VML 인 경우 처리
            $(this._ROOT_GROUP.node).css({
                'width': 21600 / scale,
                'height': 21600 / scale
            });

            $(this._ROOT_GROUP.node).find('[_type=SHAPE]').each(function (idx, item) {
                $(item).css({
                    'width': 21600,
                    'height': 21600
                });
            });
        } else {
            $(this._ROOT_GROUP.node).attr('transform', 'scale(' + scale + ')');
            $(this._ETC_GROUP.node).attr('transform', 'scale(' + scale + ')');
        }

        this._PAPER.setSize(
            OG.Util.roundGrid(this._PAPER.width / me._CONFIG.SCALE * scale, me._CONFIG.MOVE_SNAP_SIZE),
            OG.Util.roundGrid(this._PAPER.height / me._CONFIG.SCALE * scale, me._CONFIG.MOVE_SNAP_SIZE)
        );

        me._CONFIG.SCALE = scale;
    }
};

/**
 * ID에 해당하는 Element 를 캔버스에서 show 한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.show = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        rElement.show();
    }
};

/**
 * ID에 해당하는 Element 를 캔버스에서 hide 한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.hide = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        rElement.hide();
    }
};

/**
 * Source Element 를 Target Element 아래에 append 한다.
 *
 * @param {Element,String} srcElement Element 또는 ID
 * @param {Element,String} targetElement Element 또는 ID
 * @return {Element} Source Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.appendChild = function (srcElement, targetElement) {
    var srcRElement = this._getREleById(OG.Util.isElement(srcElement) ? srcElement.id : srcElement),
        targetRElement = this._getREleById(OG.Util.isElement(targetElement) ? targetElement.id : targetElement);

    targetRElement.appendChild(srcRElement);

    return srcRElement;
};

/**
 * Source Element 를 Target Element 이후에 insert 한다.
 *
 * @param {Element,String} srcElement Element 또는 ID
 * @param {Element,String} targetElement Element 또는 ID
 * @return {Element} Source Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.insertAfter = function (srcElement, targetElement) {
    var srcRElement = this._getREleById(OG.Util.isElement(srcElement) ? srcElement.id : srcElement),
        targetRElement = this._getREleById(OG.Util.isElement(targetElement) ? targetElement.id : targetElement);

    srcRElement.insertAfter(targetRElement);

    return srcRElement;
};

/**
 * Source Element 를 Target Element 이전에 insert 한다.
 *
 * @param {Element,String} srcElement Element 또는 ID
 * @param {Element,String} targetElement Element 또는 ID
 * @return {Element} Source Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.insertBefore = function (srcElement, targetElement) {
    var srcRElement = this._getREleById(OG.Util.isElement(srcElement) ? srcElement.id : srcElement),
        targetRElement = this._getREleById(OG.Util.isElement(targetElement) ? targetElement.id : targetElement);

    srcRElement.insertBefore(targetRElement);

    return srcRElement;
};

/**
 * 해당 Element 를 가로, 세로 Offset 만큼 이동한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Number[]} offset [가로, 세로]
 * @param {String[]} excludeEdgeId redraw 제외할 Edge ID
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.move = function (element, offset, excludeEdgeId) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        type = rElement ? rElement.node.getAttribute("_type") : null,
        geometry;

    this.removeCollapseGuide(element);
    if (rElement && type) {
        $(rElement.node).children("[_type=" + OG.Constants.NODE_TYPE.SHAPE + "][_shape=EDGE]").each(function (idx, item) {
            // recursive
            me.move(item, offset, excludeEdgeId);
        });
        $(rElement.node).children("[_type=" + OG.Constants.NODE_TYPE.SHAPE + "][_shape!=EDGE]").each(function (idx, item) {
            // recursive
            me.move(item, offset, excludeEdgeId);
        });

        if (type !== OG.Constants.NODE_TYPE.ROOT && rElement.node.shape) {
            geometry = rElement.node.shape.geom;
            geometry.move(offset[0], offset[1]);

            this.redrawShape(rElement.node, excludeEdgeId);

            // moveShape event fire
            $(this._PAPER.canvas).trigger('moveShape', [rElement.node, offset]);

            return rElement.node;
        } else {
            return element;
        }
    } else if (rElement) {
        rElement.transform("...t" + offset[0] + "," + offset[1]);

        // moveShape event fire
        $(this._PAPER.canvas).trigger('moveShape', [rElement.node, offset]);

        return rElement.node;
    }

    return null;
};

/**
 * 주어진 중심좌표로 해당 Element 를 이동한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Number[]} position [x, y]
 * @param {String[]} excludeEdgeId redraw 제외할 Edge ID
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.moveCentroid = function (element, position, excludeEdgeId) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        bBox, center = {};

    if (rElement && geometry) {
        center = geometry.getCentroid();

        return this.move(element, [position[0] - center.x, position[1] - center.y], excludeEdgeId);
    } else if (rElement) {
        bBox = rElement.getBBox();
        center.x = bBox.x + OG.Util.round(bBox.width / 2);
        center.y = bBox.y + OG.Util.round(bBox.height / 2);

        return this.move(element, [position[0] - center.x, position[1] - center.y]);
    }
    this.removeCollapseGuide(element);

    return null;
};

/**
 * 중심 좌표를 기준으로 주어진 각도 만큼 회전한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Number} angle 각도
 * @param {String[]} excludeEdgeId redraw 제외할 Edge ID
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.rotate = function (element, angle, excludeEdgeId) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        type = rElement ? rElement.node.getAttribute("_shape") : null,
        geometry = rElement ? rElement.node.shape.geom : null,
        shape, envelope, center, width, height;

    if (rElement && type && geometry) {
        if (type === OG.Constants.SHAPE_TYPE.IMAGE ||
            type === OG.Constants.SHAPE_TYPE.TEXT ||
            type === OG.Constants.SHAPE_TYPE.HTML) {
            shape = rElement.node.shape.clone();
            envelope = geometry.getBoundary();
            center = envelope.getCentroid();
            width = envelope.getWidth();
            height = envelope.getHeight();

            this.drawShape([center.x, center.y], shape, [width, height, angle], rElement.node.shapeStyle, rElement.node.id);
        } else {
            if (rElement.node.shape.angle) {
                geometry.rotate(-1 * rElement.node.shape.angle);
            }
            geometry.rotate(angle);
            rElement.node.shape.angle = angle;

            this.redrawShape(rElement.node, excludeEdgeId);
        }

        // rotateShape event fire
        $(this._PAPER.canvas).trigger('rotateShape', [rElement.node, angle]);

        return rElement.node;
    } else if (rElement) {
        rElement.rotate(angle);

        // rotateShape event fire
        $(this._PAPER.canvas).trigger('rotateShape', [rElement.node, angle]);

        return rElement.node;
    }

    return null;
};

/**
 * 상, 하, 좌, 우 외곽선을 이동한 만큼 리사이즈 한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Number[]} offset [상, 하, 좌, 우] 각 방향으로 + 값
 * @param {String[]} excludeEdgeId redraw 제외할 Edge ID
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.resize = function (element, offset, excludeEdgeId) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        type = rElement ? rElement.node.getAttribute("_shape") : null,
        geometry = rElement ? rElement.node.shape.geom : null,
        bBox, offsetX, offsetY, width, height, hRate, vRate;

    this.removeCollapseGuide(element);

    //TODO:
//  if (element.shape.SHAPE_TYPE == OG.Contraints.SHAPE_TYPE.GROUP){
    //  element.shape.layoutChild();
//  }
    //END


    if (rElement && type && geometry) {
        geometry.resize(offset[0], offset[1], offset[2], offset[3]);

        this.redrawShape(rElement.node, excludeEdgeId);

        // resize shpae
        this.resizeShape(rElement.node, excludeEdgeId);

        // resizeShape event fire
        $(this._PAPER.canvas).trigger('resizeShape', [rElement.node, offset]);

        return rElement.node;
    } else if (rElement) {
        bBox = rElement.getBBox();

        offsetX = offset[2] + offset[3];
        offsetY = offset[0] + offset[1];
        width = bBox.width + offsetX;
        height = bBox.height + offsetY;
        hRate = bBox.width === 0 ? 1 : width / bBox.width;
        vRate = bBox.height === 0 ? 1 : height / bBox.height;

        rElement.transform("...t" + (-1 * offset[2]) + "," + (-1 * offset[0]));
        rElement.transform("...s" + hRate + "," + vRate + "," + bBox.x + "," + bBox.y);

        // resizeShape event fire
        $(this._PAPER.canvas).trigger('resizeShape', [rElement.node, offset]);

        return rElement.node;
    }

    return null;
};

/**
 * 중심좌표는 고정한 채 Bounding Box 의 width, height 를 리사이즈 한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Number[]} size [Width, Height]
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.resizeBox = function (element, size) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        boundary, bBox, offsetWidth, offsetHeight;

    this.removeCollapseGuide(element);
    if (rElement && geometry) {
        boundary = geometry.getBoundary();
        offsetWidth = OG.Util.round((size[0] - boundary.getWidth()) / 2);
        offsetHeight = OG.Util.round((size[1] - boundary.getHeight()) / 2);

        return this.resize(element, [offsetHeight, offsetHeight, offsetWidth, offsetWidth]);
    } else if (rElement) {
        bBox = rElement.getBBox();
        offsetWidth = OG.Util.round((size[0] - bBox.width) / 2);
        offsetHeight = OG.Util.round((size[1] - bBox.height) / 2);

        return this.resize(element, [offsetHeight, offsetHeight, offsetWidth, offsetWidth]);
    }

    return null;
};

/**
 * 노드 Element 를 복사한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.clone = function (element) {
    // TODO : 오류 - group 인 경우 clone 처리 필요
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element), newElement;
    newElement = rElement.clone();
    this._add(newElement);
    this._ROOT_GROUP.node.appendChild(newElement.node);

    return newElement.node;
};

/**
 * ID로 Node Element 를 반환한다.
 *
 * @param {String} id
 * @return {Element} Element
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getElementById = function (id) {
    var rElement = this._getREleById(id);
    return rElement ? rElement.node : null;
};

/**
 * 해당 엘리먼트의 BoundingBox 영역 정보를 반환한다.
 *
 * @param {Element,String} element
 * @return {Object} {width, height, x, y, x2, y2}
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getBBox = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    return rElement.getBBox();
};

/**
 * 부모노드기준으로 캔버스 루트 엘리먼트의 BoundingBox 영역 정보를 반환한다.
 *
 * @return {Object} {width, height, x, y, x2, y2}
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getRootBBox = function () {
    var container = this._PAPER.canvas.parentNode,
        width = OG.Util.isFirefox() ? this._PAPER.canvas.width.baseVal.value : this._PAPER.canvas.scrollWidth,
        height = OG.Util.isFirefox() ? this._PAPER.canvas.height.baseVal.value : this._PAPER.canvas.scrollHeight,
        x = container.offsetLeft,
        y = container.offsetTop;

    return {
        width: width,
        height: height,
        x: x,
        y: y,
        x2: x + width,
        y2: y + height
    };
};

/**
 * 캔버스의 컨테이너 DOM element 를 반환한다.
 *
 * @return {Element} 컨테이너
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.getContainer = function () {
    return this._PAPER.canvas.parentNode;
};

/**
 * SVG 인지 여부를 반환한다.
 *
 * @return {Boolean} svg 여부
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.isSVG = function () {
    return Raphael.svg;
};

/**
 * VML 인지 여부를 반환한다.
 *
 * @return {Boolean} vml 여부
 * @override
 */
OG.renderer.RaphaelRenderer.prototype.isVML = function () {
    return Raphael.vml;
};

/**
 * Node 엘리먼트의 커넥트 가이드 영역 엘리먼트를 반환한다.
 *
 * @param {Element} Element 엘리먼트
 * @return {Array} Array Element
 */
OG.renderer.RaphaelRenderer.prototype.getConnectGuideElements = function (element) {
    var childNodes, i, connectGuideElements = [];
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        childNodes = rElement.node.childNodes;
        for (i = childNodes.length - 1; i >= 0; i--) {
            if ($('#' + childNodes[i].id) && $('#' + childNodes[i].id).attr('name') == OG.Constants.CONNECT_GUIDE_EVENT_AREA.NAME) {
                connectGuideElements.push(childNodes[i]);
            }
        }
    }
    return connectGuideElements;
};

/**
 * Node 엘리먼트의 커넥트 가이드 영역을 제외한 엘리먼트를 반환한다.
 *
 * @param {Element} Element 엘리먼트
 * @return {Array} Array Element
 */
OG.renderer.RaphaelRenderer.prototype.getNotConnectGuideElements = function (element) {
    var childNodes, i, notConnectGuideElements = [];
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    if (rElement) {
        childNodes = rElement.node.childNodes;
        for (i = childNodes.length - 1; i >= 0; i--) {
            if ($('#' + childNodes[i].id) && $('#' + childNodes[i].id).attr('name') !== OG.Constants.CONNECT_GUIDE_EVENT_AREA.NAME) {
                notConnectGuideElements.push(childNodes[i]);
            }
        }
    }
    return notConnectGuideElements;
};


OG.renderer.RaphaelRenderer.prototype.drawConnectGuide = function (element) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        envelope,
        guide,
        _connectBoxRect,
        _upperLeft,
        vertualBoundary,
        _size = me._CONFIG.GUIDE_RECT_SIZE, _hSize = OG.Util.round(_size / 2);

    var spotCircleStyle = me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_SPOT_CIRCLE;
    var spotRectStyle = me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_SPOT_RECT;

    var drawEdgeSpot = function () {
        var vertices = geometry.getVertices();
        var spots = [];

        //변곡점 스팟
        for (var i = 0; i < vertices.length; i++) {
            var spot = me._PAPER.circle(vertices[i].x, vertices[i].y, spotCircleStyle.r);
            spot.attr(spotCircleStyle);
            me._add(spot);
            rElement.appendChild(spot);
            $(spot.node).data('index', i);
            $(spot.node).data('vertice', vertices[i]);
            $(spot.node).data('parent', rElement);
            $(spot.node).data('type', OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT_CIRCLE);
            $(spot.node).attr('name', OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT);
            me.toFront(spot);
            spots.push(spot.node);
        }
        //직각이동 스팟
        $.each(vertices, function (index, vertice) {
            if (index > 0) {
                var isRightAngle = geometry.isRightAngleBetweenPoints(vertices[index - 1], vertices[index]);
                if (isRightAngle.flag) {
                    var middleSpotPoint = {
                        x: (vertices[index - 1].x + vertices[index].x) / 2,
                        y: (vertices[index - 1].y + vertices[index].y) / 2
                    }
                    if (isRightAngle.type === 'vertical') {
                        var width = spotRectStyle.w;
                        var height = spotRectStyle.h;
                        vertualBoundary = {
                            x: middleSpotPoint.x - (height / 2),
                            y: middleSpotPoint.y - (width / 2),
                            width: height,
                            height: width,
                        };
                        spotRectStyle.cursor = 'ew-resize';
                    } else {
                        var width = spotRectStyle.w;
                        var height = spotRectStyle.h;
                        vertualBoundary = {
                            x: middleSpotPoint.x - (width / 2),
                            y: middleSpotPoint.y - (height / 2),
                            width: width,
                            height: height,
                        }
                        spotRectStyle.cursor = 'ns-resize';
                    }

                    var spot = me._PAPER.rect(vertualBoundary.x, vertualBoundary.y, vertualBoundary.width, vertualBoundary.height);
                    spot.attr(spotRectStyle);
                    me._add(spot);
                    rElement.appendChild(spot);
                    $(spot.node).data('prev', index - 1);
                    $(spot.node).data('next', index);
                    $(spot.node).data('parent', rElement);
                    $(spot.node).data('vertice', middleSpotPoint);
                    $(spot.node).attr('name', OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT);
                    $(spot.node).data('type', OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT_RECT);
                    $(spot.node).data('direction', isRightAngle.type);
                    me.toFront(spot);
                    spots.push(spot.node);
                }
            }
        })

        return spots;
    }

    if (me.getSpots(element).length > 0) {
        // 스팟이 이미 존재하는 경우에는 가이드만 새로 만든다.
        return null;
    }

    if (rElement && geometry) {
        envelope = geometry.getBoundary();
        _upperLeft = envelope.getUpperLeft();

        var expendBoundary = {
            x: _upperLeft.x - me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_BBOX_EXPEND,
            y: _upperLeft.y - me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_BBOX_EXPEND,
            width: envelope.getWidth() + me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_BBOX_EXPEND * 2,
            height: envelope.getHeight() + me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_BBOX_EXPEND * 2
        }

        this._remove(this._getREleById(rElement.id + OG.Constants.CONNECT_GUIDE_SUFFIX.BBOX));
        _connectBoxRect = this._PAPER.rect(expendBoundary.x, expendBoundary.y, expendBoundary.width, expendBoundary.height);
        _connectBoxRect.attr(me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_BBOX);
        this._add(_connectBoxRect, rElement.id + OG.Constants.CONNECT_GUIDE_SUFFIX.BBOX);

        if ($(element).attr("_shape") === OG.Constants.SHAPE_TYPE.EDGE) {
            var spots = drawEdgeSpot();
            // guide 정의
            guide = {
                bBox: _connectBoxRect.node,
                spots: spots
            };
        } else {
            // guide 정의
            guide = {
                bBox: _connectBoxRect.node
            };
        }
        // layer 위치 조정
        _connectBoxRect.insertBefore(rElement);

        return guide;
    }
    return null;
};

OG.renderer.RaphaelRenderer.prototype.removeConnectGuide = function (element) {
    var me = this;
    var rElement = me._getREleById(OG.Util.isElement(element) ? element.id : element),
        bBox = me._getREleById(rElement.id + OG.Constants.CONNECT_GUIDE_SUFFIX.BBOX);
    $(me.getSpots(element)).each(function (index, spot) {
        me._remove(me._getREleById(spot.id));
    })
    me._remove(bBox);
};

OG.renderer.RaphaelRenderer.prototype.removeAllConnectGuide = function () {

    var me = this;
    $(me.getRootElement()).find("[_type=" + OG.Constants.NODE_TYPE.SHAPE + "]").each(function (index, item) {
        if (OG.Util.isElement(item) && item.id) {
            me.removeConnectGuide(item);
            me.removeVirtualSpot(item);
        }
    });
};

OG.renderer.RaphaelRenderer.prototype.removeOtherConnectGuide = function (element) {

    var me = this;
    $(me.getRootElement()).find("[_type=" + OG.Constants.NODE_TYPE.SHAPE + "]").each(function (index, item) {
        if (OG.Util.isElement(item) && item.id && element.id !== item.id) {
            me.removeConnectGuide(item);
            me.removeVirtualSpot(item);
        }
    });
};


/**
 * Element 내부의 Spot 들을 반환한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Array} Spot Element Array
 */
OG.renderer.RaphaelRenderer.prototype.getSpots = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        list = [];

    if (rElement) {
        $('#' + rElement.id).find('[name=' + OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT + ']').each(function (index, spot) {
            list.push(spot);
        });
    }
    return list;
}

/**
 * Element 내부의 변곡점 Spot 들만 반환한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Array} Spot Element Array
 */
OG.renderer.RaphaelRenderer.prototype.getCircleSpots = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        list = [];

    if (rElement) {
        $('#' + rElement.id).find('[name=' + OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT + ']').each(function (index, spot) {
            if ($(spot).data('type') === OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT_CIRCLE) {
                list.push(spot);
            }
        });
    }
    return list;
}


/**
 * 주어진 좌표와 가장 Edge Element의 가장 가까운 거리에 가상 변곡점 스팟을 생성한다.
 *
 * @param {Number} x 이벤트의 캔버스 기준 x 좌표
 * @param {Number} x 이벤트의 캔버스 기준 y 좌표
 * @param {Element,String} element Element 또는 ID
 * @return {Element} Spot Element
 */
OG.renderer.RaphaelRenderer.prototype.createVirtualSpot = function (x, y, element) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null,
        vertices,
        minDistanceLine = [],
        minDistance = 0,
        minDistanceIndex = [],
        spots,
        enableDrawDistance,
        coordinate,
        spotCircleStyle,
        virtualSpot


    //기존 가상스팟은 삭제한다.
    me.removeVirtualSpot(element);

    //엣지가 아닐경우 스킵
    if ($(element).attr("_shape") !== OG.Constants.SHAPE_TYPE.EDGE) {
        return null;
    }

    if (rElement && geometry) {
        vertices = geometry.getVertices();
        minDistanceLine = [];
        minDistanceIndex = [];
        minDistance = 0;
        $.each(vertices, function (index, vertice) {
            if (index > 0) {
                var distance = geometry.distanceToLine([x, y], [vertices[index - 1], vertices[index]]);
                if (index == 1) {
                    minDistance = distance;
                    minDistanceLine = [vertices[index - 1], vertices[index]];
                    minDistanceIndex = [index - 1, index];
                } else {
                    if (distance < minDistance) {
                        minDistance = distance;
                        minDistanceLine = [vertices[index - 1], vertices[index]];
                        minDistanceIndex = [index - 1, index];
                    }
                }
            }
        });

        coordinate = geometry.intersectPointToLine([x, y], minDistanceLine);

        spotCircleStyle = me._CONFIG.DEFAULT_STYLE.CONNECT_GUIDE_SPOT_CIRCLE;

        //가상 변곡점 스팟의 생성조건
        //조건1 : 가상 스팟 생성시 고정 스팟의 바운더리 영역과 겹치지 않아야 한다.

        //구현계산:
        //가상점의 중심과 고정스팟의 중심의 거리가,
        //고정스팟이 원일경우 : 고정스팟 반지름 + 가상스팟 반지름보다 커야 생성가능하다.
        //고정스팟이 사각형일경우 : 고정스팟의 긴 변 + 가상스팟 반지름보다 커야 생성가능하다.
        spots = me.getSpots(element);
        enableDrawDistance = true;
        $.each(spots, function (index, spot) {
            var type = $(spot).data('type');
            var center = $(spot).data('vertice');

            var coordinateToSpotDistance =
                Math.sqrt(
                    Math.pow((coordinate.x - center.x), 2) + Math.pow((coordinate.y - center.y), 2)
                );

            if (type === OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT_CIRCLE) {
                var preventArea = spotCircleStyle.r +
                    parseInt($(spot).attr('r'));
                if (preventArea >= coordinateToSpotDistance) {
                    enableDrawDistance = false;
                }
            }
            if (type === OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT_RECT) {
                var longSide = $(spot).attr('width');
                if ($(spot).attr('height') > $(spot).attr('width')) {
                    longSide = $(spot).attr('height');
                }
                var preventArea = spotCircleStyle.r +
                    parseInt(longSide);
                if (preventArea >= coordinateToSpotDistance) {
                    enableDrawDistance = false;
                }
            }
        })
        if (!enableDrawDistance) {
            return null;
        }

        virtualSpot = me._PAPER.circle(coordinate.x, coordinate.y, spotCircleStyle.r);
        virtualSpot.attr(spotCircleStyle);
        me._add(virtualSpot);
        rElement.appendChild(virtualSpot);

        $(virtualSpot.node).data('prev', minDistanceIndex[0]);
        $(virtualSpot.node).data('next', minDistanceIndex[1]);
        $(virtualSpot.node).data('vertice', coordinate);
        $(virtualSpot.node).data('parent', rElement);
        $(virtualSpot.node).data('type', OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT_CIRCLE);
        $(virtualSpot.node).attr('name', OG.Constants.CONNECT_GUIDE_SUFFIX.VIRTUAL_SPOT);
        me.toFront(virtualSpot);
        return virtualSpot.node;
    }
    return null;
}

/**
 * Element 내부의 가상 변곡점 스팟을 반환한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Element} Spot Element
 */
OG.renderer.RaphaelRenderer.prototype.getVirtualSpot = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        id, spot;

    if (rElement) {
        spot = $('#' + rElement.id).find('[name=' + OG.Constants.CONNECT_GUIDE_SUFFIX.VIRTUAL_SPOT + ']');
        id = spot.attr('id');
    }
    return this.getElementById(id);
}

/**
 * Element 내부의 가상 변곡점 스팟을 삭제한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Element} Spot Element
 */
OG.renderer.RaphaelRenderer.prototype.removeVirtualSpot = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        id, spot;

    if (rElement) {
        spot = $('#' + rElement.id).find('[name=' + OG.Constants.CONNECT_GUIDE_SUFFIX.VIRTUAL_SPOT + ']');
        id = spot.attr('id');
    }
    return this.remove(id);
}

/**
 * Element 내부의 Spot 중 선택한 스팟을 제외하고 모두 삭제하고, 가이드라인도 삭제한다.
 *
 * @param {Element,String} 선택한 spot Element 또는 ID
 */
OG.renderer.RaphaelRenderer.prototype.selectSpot = function (spot) {
    var me = this;
    var spotRElement = this._getREleById(OG.Util.isElement(spot) ? spot.id : spot);
    if (spotRElement) {
        var parentRElement = $(spotRElement.node).data('parent');

        this._remove(this._getREleById(parentRElement.id + OG.Constants.CONNECT_GUIDE_SUFFIX.BBOX));

        $(me.getSpots(parentRElement.node)).each(function (index, _spot) {
            if (_spot.id !== spotRElement.node.id) {
                me.remove(_spot);
            }
        });
    }
}

/**
 * Edge의 하위 엘리먼트들을 제거한다.
 *
 * @param {Raphael.Element} rElement 라파엘 엘리먼트
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._removeEdgeChild = function (rElement) {
    var childNodes, i;
    if (rElement) {
        childNodes = rElement.node.childNodes;
        for (i = childNodes.length - 1; i >= 0; i--) {
            //스팟은 삭제하지 않는다.
            var skipRemove = false;
            if ($(childNodes[i]).attr('name') === OG.Constants.CONNECT_GUIDE_SUFFIX.VIRTUAL_SPOT) {
                skipRemove = true;
            }
            if ($(childNodes[i]).attr('name') === OG.Constants.CONNECT_GUIDE_SUFFIX.SPOT) {
                skipRemove = true;
            }
            if (!skipRemove) {
                this._remove(this._getREleById(childNodes[i].id));
            }
        }
    }
};

/**
 * 하위 엘리먼트들을 반환한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {Array} Array Element
 */
OG.renderer.RaphaelRenderer.prototype.getChildNodes = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    var childNodes, i;
    if (rElement) {
        childNodes = rElement.node.childNodes;
    }
    if (!childNodes) {
        return [];
    } else {
        return childNodes;
    }
};

/**
 * Edge Element 내부의 패스중 나열된 세 꼭지점이 평행에 가까울 경우 하나의 선분으로 정리한다.
 *
 * @param {Element,String} element Element 또는 ID
 */
OG.renderer.RaphaelRenderer.prototype.trimEdge = function (element) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        geometry = rElement ? rElement.node.shape.geom : null;

    var vertices = geometry.getVertices();
    var orgVerticesLength = vertices.length;

    for (var i = vertices.length; i--;) {
        if (i < vertices.length - 1 && vertices[i - 1]) {
            var angleBetweenThreePoints =
                geometry.angleBetweenThreePoints(vertices[i + 1], vertices[i], vertices[i - 1]);

            if (vertices[i + 1].x === vertices[i].x && vertices[i + 1].y === vertices[i].y) {
                vertices.splice(i, 1);
            }
            else if (vertices[i].x === vertices[i - 1].x && vertices[i].y === vertices[i - 1].y) {
                vertices.splice(i, 1);
            }

            else if (angleBetweenThreePoints >= me._CONFIG.TRIM_EDGE_ANGLE_SIZE) {
                vertices.splice(i, 1);
            }
        }
    }
    if (orgVerticesLength !== vertices.length) {
        element.shape.geom.setVertices(vertices);
        element = me.drawEdge(new OG.PolyLine(vertices), element.shape.geom.style, element.id);
        me.drawLabel(element);
        me.drawEdgeLabel(element, null, 'FROM');
        me.drawEdgeLabel(element, null, 'TO');
    }
}

/**
 * ID에 해당하는 Element 의 바운더리 영역을 리턴한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @return {OG.geometry.Envelope} Envelope 영역
 */
OG.renderer.RaphaelRenderer.prototype.getBoundary = function (element) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element),
        envelope;

    if (rElement && rElement.node && rElement.node.shape && rElement.node.shape.geom) {
        envelope = rElement.node.shape.geom.getBoundary();
    }

    return envelope;
};

/**
 * Element 에 하이라이트 속성을 부여한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Object} highlight HIGHLIGHT 속성 집합.
 */
OG.renderer.RaphaelRenderer.prototype.setHighlight = function (element, highlight) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    var me = this;
    if (rElement) {
        element = rElement.node;
        var childNodes = me.getNotConnectGuideElements(element);
        $.each(childNodes, function (idx, childNode) {
            var orgAttrGroup = {};
            for (var key in highlight) {
                var orgAttr = me.getAttr(childNode, key);
                if (orgAttr) {
                    orgAttrGroup[key] = orgAttr;
                }
            }
            $(childNode).data('orgAttrGroup', orgAttrGroup);
            me.setAttr(childNode, highlight);
        });
    }
}

/**
 * Element 에 하이라이트 속성을 제거한다.
 *
 * @param {Element,String} element Element 또는 ID
 * @param {Object} highlight HIGHLIGHT 속성 집합.
 */
OG.renderer.RaphaelRenderer.prototype.removeHighlight = function (element, highlight) {
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);
    var me = this;
    if (rElement) {
        element = rElement.node;
        var childNodes = me.getNotConnectGuideElements(element);
        $.each(childNodes, function (idx, childNode) {
            var orgAttrGroup = $(childNode).data('orgAttrGroup');
            for (var key in highlight) {
                var orgAttr = orgAttrGroup[key];
                if (!orgAttr) {
                    orgAttrGroup[key] = null;
                }
            }
            $(childNode).removeData('orgAttrGroup');
            me.setAttr(childNode, orgAttrGroup);
        });
    }
}

/**
 * 터미널 문자열을 생성한다.
 *
 * @param {Element,String} Element Element 또는 ID
 * @param {Array} point 연결 좌표정보 [x,y]
 *
 * @return {String} terminal 터미널 문자열
 */
OG.renderer.RaphaelRenderer.prototype.createTerminalString = function (element, point) {

    var terminal;
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);

    if (rElement) {
        var percentageDistance = rElement.node.shape.geom.getPercentageDistanceFromPoint(point);
        if (percentageDistance) {
            terminal = rElement.node.id + OG.Constants.TERMINAL + '_' + percentageDistance.px + '_' + percentageDistance.py;
        }
    }
    return terminal;
}

/**
 * 디폴트 터미널 문자열을 생성한다.
 *
 * @param {Element,String} Element Element 또는 ID
 *
 * @return {String} terminal 터미널 문자열
 */
OG.renderer.RaphaelRenderer.prototype.createDefaultTerminalString = function (element) {

    var terminal;
    var rElement = this._getREleById(OG.Util.isElement(element) ? element.id : element);

    if (rElement) {
        var percentageDistance = {px: 50, py: 50};
        if (percentageDistance) {
            terminal = rElement.node.id + OG.Constants.TERMINAL + '_' + percentageDistance.px + '_' + percentageDistance.py;
        }
    }
    return terminal;
}

/**
 * 터미널로부터 부모 Shape element 로의 퍼센테이지 좌표를 반환한다.
 *
 * @param {Element,String} terminal 터미널 Element or ID
 * @return {Array} [px,py]
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._getPercentageFromTerminal = function (terminal) {
    var pXpY;
    if (terminal) {
        var shapeId = terminal.substring(0, terminal.indexOf(OG.Constants.TERMINAL));
        var replace = terminal.replace(shapeId + OG.Constants.TERMINAL + '_', '');
        var split = replace.split('_');
        pXpY = [parseInt(split[0]), parseInt(split[1])]
    }
    return pXpY;
}
/**
 * 터미널로부터 좌표를 반환한다.
 *
 * @param {Element,String} terminal 터미널 Element or ID
 * @return {OG.geometry.Coordinate} 좌표
 * @private
 */
OG.renderer.RaphaelRenderer.prototype._getPositionFromTerminal = function (terminal) {
    var xy, pXpY;
    if (terminal) {
        var shapeId = terminal.substring(0, terminal.indexOf(OG.Constants.TERMINAL));
        var replace = terminal.replace(shapeId + OG.Constants.TERMINAL + '_', '');
        pXpY = replace.split('_');
        var rElement = this._getREleById(shapeId);
        if (rElement) {
            xy = rElement.node.shape.geom.getPointFromPercentageDistance(pXpY);
        }
    }
    return xy;
}

/**
 * 캔버스의 Edge 들을 항상 최상단으로 이동시킨다.
 *
 * @param {Element,String} terminal 터미널 Element or ID
 */
OG.renderer.RaphaelRenderer.prototype.toFrontEdges = function () {
    //Edge는 항상 toFront
    var me = this;
    var minIdx;
    var root = me.getRootGroup();
    var edges = [];
    var shapes = [];
    $.each(root.childNodes, function (idx, childNode) {
        if ($(childNode).attr("_shape") === OG.Constants.SHAPE_TYPE.EDGE) {
            //root.removeChild(childNode);
            //root.appendChild(childNode);

            edges.push(childNode);
        } else {
            shapes.push(childNode);
        }
    });

    for (var i = 0; i < shapes.length; i++) {
        root.removeChild(shapes[i]);
        root.appendChild(shapes[i]);
    }
    for (var i = 0; i < edges.length; i++) {
        root.removeChild(edges[i]);
        root.appendChild(edges[i]);
    }
}

/**
 * 주어진 좌표와 선택된 Element 사이에 가상 연결선을 생성한다.
 *
 * @param {Number} x 이벤트의 캔버스 기준 x 좌표
 * @param {Number} x 이벤트의 캔버스 기준 y 좌표
 * @param {Element,String} targetEle Element 또는 ID
 * @return {Element} Edge Element
 */
OG.renderer.RaphaelRenderer.prototype.createVirtualEdge = function (x, y, targetEle) {
    var me = this, rElement = this._getREleById(OG.Util.isElement(targetEle) ? targetEle.id : targetEle),
        geometry = rElement ? rElement.node.shape.geom : null,
        virtualEdge,
        virtualEdgeStyle = me._CONFIG.DEFAULT_STYLE.GUIDE_VIRTUAL_EDGE,
        root = me.getRootElement();

    //엣지 일경우 스킵
    if ($(targetEle).attr("_shape") === OG.Constants.SHAPE_TYPE.EDGE) {
        return null;
    }

    //기존 가상선은 삭제한다.
    me.removeAllVirtualEdge();

    if (rElement && geometry) {
        var boundary = me.getBoundary(targetEle);
        var width = boundary.getWidth();
        var height = boundary.getHeight();
        var upperLeft = boundary.getUpperLeft();
        var start = [Math.round(upperLeft.x + (width / 2)), Math.round(upperLeft.y + (height / 2))];
        var end = [x - 3, y - 3]

        virtualEdge = me.drawEdge(new OG.PolyLine([start, end]), virtualEdgeStyle, OG.Constants.GUIDE_SUFFIX.LINE_VIRTUAL_EDGE);

        $(virtualEdge).data('targetEle', targetEle);
        return virtualEdge;
    }
    return null;
}

/**
 * 캔버스의 가상 연결선을 업데이트한다.
 *
 * @param {Number} x 이벤트의 캔버스 기준 x 좌표
 * @param {Number} x 이벤트의 캔버스 기준 y 좌표
 */
OG.renderer.RaphaelRenderer.prototype.updateVirtualEdge = function (x, y) {
    var me = this, rElement,
        geometry,
        virtualEdge, targetEle,
        virtualEdgeStyle = me._CONFIG.DEFAULT_STYLE.GUIDE_VIRTUAL_EDGE;


    var caculateNoneEventAreaPoint = function (startP, targetP) {
        var eventProtectLength = 5;
        var _x, _y, _a, _sa;
        _a = ((startP[1] - targetP[1]) * -1) / (startP[0] - targetP[0]);
        _sa = Math.pow(_a, 2);
        _x = Math.sqrt(Math.pow(eventProtectLength, 2) / (_sa + 1));
        _y = Math.sqrt(Math.pow(eventProtectLength, 2) - Math.pow(_x, 2));

        var fixedTagetP = {
            x : targetP[0],
            y : targetP[1]
        };
        if(targetP[0] > startP[0]){
            fixedTagetP.x = targetP[0] - _x;
        }
        if(targetP[0] < startP[0]){
            fixedTagetP.x = targetP[0] + _x;
        }

        if(targetP[1] > startP[1]){
            fixedTagetP.y = targetP[1] - _y;
        }
        if(targetP[1] < startP[1]){
            fixedTagetP.y = targetP[1] + _y;
        }
        return [fixedTagetP.x , fixedTagetP.y];
    }

    virtualEdge = me.getElementById(OG.Constants.GUIDE_SUFFIX.LINE_VIRTUAL_EDGE);

    if (virtualEdge) {
        targetEle = $(virtualEdge).data('targetEle');
    }

    if (targetEle) {
        rElement = this._getREleById(OG.Util.isElement(targetEle) ? targetEle.id : targetEle);
        geometry = rElement ? rElement.node.shape.geom : null;
    }

    if (rElement && geometry) {
        var boundary = me.getBoundary(targetEle);
        var width = boundary.getWidth();
        var height = boundary.getHeight();
        var upperLeft = boundary.getUpperLeft();
        var start = [Math.round(upperLeft.x + (width / 2)), Math.round(upperLeft.y + (height / 2))];
        var end = [x, y];
        var fixedEnd = caculateNoneEventAreaPoint(start, end);

        me.drawEdge(new OG.PolyLine([start, fixedEnd]), virtualEdgeStyle, OG.Constants.GUIDE_SUFFIX.LINE_VIRTUAL_EDGE);
    }
}

/**
 * 캔버스의 가상선의 타겟 엘리먼트를 구한다.
 *
 * @param {Number} x 이벤트의 캔버스 기준 x 좌표
 * @param {Number} x 이벤트의 캔버스 기준 y 좌표
 */
OG.renderer.RaphaelRenderer.prototype.getTargetfromVirtualEdge = function () {
    var me = this, rElement,
        geometry,
        virtualEdge, targetEle;

    virtualEdge = me.getElementById(OG.Constants.GUIDE_SUFFIX.LINE_VIRTUAL_EDGE);

    if (virtualEdge) {
        targetEle = $(virtualEdge).data('targetEle');
    }

    if (targetEle) {
        return targetEle;
    }

    return null;
}

/**
 * 캔버스의 가상선을 삭제한다.
 */
OG.renderer.RaphaelRenderer.prototype.removeAllVirtualEdge = function () {
    $(this.getRootGroup()).data(OG.Constants.GUIDE_SUFFIX.LINE_CONNECT_MODE, false);
    return this.remove(OG.Constants.GUIDE_SUFFIX.LINE_VIRTUAL_EDGE);
}

