function StartupStash(){
    this.categories = new Array();
    this.featuredresources = new Array();
}

function Category() {
    this.title;
    this.url;
    this.products = new Array();
    this.queue;
}

function Product(){
    this.title;
    this.representation;
    this.desc;
    this.body;
    this.url;
    this.webUrl;
    this.logoUrl;
    this.posterUrl;
    this.queue;
}

function FeaturedResources(){
    this.title;
    this.desc;
    this.category;
    this.url;
    this.logoUrl;
}

module.exports.StartupStash = StartupStash;
module.exports.Category = Category;
module.exports.Product = Product;
module.exports.FeaturedResources = FeaturedResources;