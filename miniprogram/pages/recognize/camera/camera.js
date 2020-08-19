var http = require('../../../utils/http.js')
const app = getApp()
Page({
  data: {
    accessToken: "",
    isShow: false,
    results: [],
    src: "",
    isCamera: true,
    btnTxt: "拍照",
    cWidth: 0,
    cHeight: 0
  },
  onLoad() {
    this.onGetOpenid()
    this.ctx = wx.createCameraContext()
    var time = wx.getStorageSync("time")
    var curTime = new Date().getTime()
    var timeInt = parseInt(time)
    var timeNum = parseInt((curTime - timeInt) / (1000 * 60 * 60 * 24))
    console.log("=======" + timeNum)
    var accessToken = wx.getStorageSync("access_token")
    console.log("====accessToken===" + accessToken + "a")
    if (timeNum > 28 || !accessToken) {
      this.accessTokenFunc()
    } else {
      this.setData({
        accessToken: wx.getStorageSync("access_token")
      })
    }
  },
  onGetOpenid: function() {
    // 调用云函数
    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: res => {
        console.log('[云函数] [login] user openid: ', res.result.openid)
        app.globalData.openid = res.result.openid
        // wx.navigateTo({
        //   url: '../userConsole/userConsole',
        // })
      },
      fail: err => {
        console.error('[云函数] [login] 调用失败', err)
        // wx.navigateTo({
        //   url: '../deployFunctions/deployFunctions',
        // })
      }
    })
  },
  onAdd: function (data) {
    const db = wx.cloud.database()
    db.collection('plants').add({
      data,
      success: res => {
        // 在返回结果中会包含新创建的记录的 _id 
        console.log('[数据库] [新增记录] 成功，记录 _id: ', res._id)
      },
      fail: err => {
        wx.showToast({
          icon: 'none',
          title: '新增记录失败'
        })
        console.error('[数据库] [新增记录] 失败：', err)
      }
    })
  },
  takePhoto() {
    var that = this
    if (this.data.isCamera == false) {
      this.setData({
        isCamera: true,
        btnTxt: "拍照"
      })
      return
    }
    this.ctx.takePhoto({
      quality: 'low',
      success: (result) => {
        that.setData({
          src: result.tempImagePath,
          isCamera: false,
          btnTxt: "重拍"
        })
        wx.showLoading({
          title: '正在识别中',
        })
        // var index = result.tempImagePath.lastIndexOf(".")
        // console.log("===index===" + index)
        // var mineType = result.tempImagePath.substr(index + 1)
        // console.log("===mineType===" + mineType)
        // mineType = "image/" + mineType
        // console.log('1111111',result.tempImagePath);
       
        const filePath = result.tempImagePath
        const prefix = filePath.replace('wxfile://', '').split('.')[0]
        // 上传图片
        const cloudPath = prefix + filePath.match(/\.[^.]+?$/)[0]
        console.log('cloudPath is -------', cloudPath)
       
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: res => {
            console.log('[上传文件] 成功：', res)
            // 处理插入数据库
            this.onAdd({openId: app.globalData.openId, src: res.fileID});
            wx.getImageInfo({
              src: result.tempImagePath,
              success: function (res) {
                that.cutImg(res)
              }
            })
            // app.globalData.fileID = res.fileID
            // app.globalData.cloudPath = cloudPath
            // app.globalData.imagePath = filePath
            
            // wx.navigateTo({
            //   url: '../storageConsole/storageConsole'
            // })
          },
          fail: e => {
            console.error('[上传文件] 失败：', e)
            wx.showToast({
              icon: 'none',
              title: '上传失败',
            })
          },
          complete: () => {
            // wx.hideLoading()
          }
        })
      }
    })
  },
  cutImg: function(res) {
    var that = this
    var ratio = 3;
    var canvasWidth = res.width //图片原始长宽
    var canvasHeight = res.height
    while (canvasWidth > 100 || canvasHeight > 100) { // 保证宽高在400以内
      canvasWidth = Math.trunc(res.width / ratio)
      canvasHeight = Math.trunc(res.height / ratio)
      ratio++;
    }
    that.setData({
      cWidth: canvasWidth,
      cHeight: canvasHeight
    })
    //----------绘制图形并取出图片路径--------------
    var ctx = wx.createCanvasContext('canvas')
    ctx.drawImage(res.path, 0, 0, canvasWidth, canvasHeight)
    ctx.draw(false, setTimeout(function() {
      wx.canvasToTempFilePath({
        canvasId: 'canvas',
        fileType:'png',
        destWidth: canvasWidth,
        destHeight: canvasHeight,
        success: function(res) {
          console.log(res.tempFilePath) //最终图片路径

          wx.getFileSystemManager().readFile({
            filePath: res.tempFilePath,
            encoding: "base64",
            success: res => {
              that.onCheckImg( res.data)
            },
            fail: res => {
              wx.hideLoading()
              wx.showToast({
                title: '拍照失败,未获取相机权限或其他原因',
                icon: "none"
              })
            }
          })
        },
        fail: function(res) {
          wx.hideLoading()
          console.log(res.errMsg)
        }
      })
    }, 100))
  },
  // 默认图片不能超过1m
  onCheckImg: function(buffer) {
    var that = this
    wx.cloud.callFunction({
      name: "checkImg",
      data: {
        type: 'image/png',
        buffer: buffer
      },
      success: res => {
        console.log("=onCheckImg=success===" + JSON.stringify(res))
        if (res.result.errCode == 0) {
          that.req(that.data.accessToken, buffer)
        } else if (res.result.errCode == 87014) {
          wx.hideLoading()
          wx.showToast({
            icon: 'none',
            title: '内容含有违法违规内容',
          })
        } else {
          wx.hideLoading()
        }
      },
      fail: err => {
        wx.hideLoading()
        console.log("=onCheckImg=err===" + JSON.stringify(err))
        // return cb(err)
      },
    })
  },
  req: function(token, image) {
    var that = this
    http.req("https://aip.baidubce.com/rest/2.0/image-classify/v1/plant?access_token=" + token, {
      "image": image
    }, function(res) {
      wx.hideLoading()
      
      var code = res.data.err_code
      if (code == 111 || code == 100 || code == 110) {
        wx.clearStorageSync("access_token")
        wx.clearStorageSync("time")
        that.accessTokenFunc()
        return
      }
      var num = res.result_num
      var results = res.data.result
      if (results != undefined && results != null) {
        that.setData({
          isShow: true,
          results: results
        })
        console.log(results)
        wx.showToast({
          icon: 'none',
          title: JSON.stringify(results),
        })
      } else {
        wx.clearStorageSync("access_token")
      }
    }, "POST")
  },
  accessTokenFunc: function() {
    var that = this
    console.log("accessTokenFunc is start")
    wx.cloud.callFunction({
      name: 'baiduAccessToken',
      success: res => {
        console.log("==baiduAccessToken==" + JSON.stringify(res))
        that.data.accessToken = res.result.data.access_token
        wx.setStorageSync("access_token", res.result.data.access_token)
        wx.setStorageSync("time", new Date().getTime())
      },
      fail: err => {
        wx.clearStorageSync("access_token")
        wx.showToast({
          icon: 'none',
          title: '调用失败,请重新尝试',
        })
        console.error('[云函数] [suaccessTokenFuncm] 调用失败：', err)
      }
    })
  },
  // radioChange: function(e) {
  //   console.log(e)
  //   console.log(e.detail)
  //   console.log(e.detail.value)
  //   wx.navigateTo({
  //     url: '/pages/result/list?keyword=' + e.detail.value,
  //   })
  // },
  // hideModal: function() {
  //   this.setData({
  //     isShow: false,
  //   })
  // },
  // stopRecord() {
  //   this.ctx.stopRecord({
  //     success: (res) => {
  //       this.setData({
  //         src: res.tempThumbPath,
  //         videoSrc: res.tempVideoPath
  //       })
  //     }
  //   })
  // },
  // error(e) {
  //   console.log(e.detail)
  // }

})