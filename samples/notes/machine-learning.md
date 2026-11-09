# Introduction to Machine Learning

These lecture notes introduce the main ideas of machine learning: what it is, the main types of learning, how a model is trained and evaluated, and some common pitfalls. A small amount of maths and code is included to make the ideas concrete.

## 1. What machine learning is

In traditional programming, a person writes explicit rules that turn inputs into outputs. In machine learning, the computer is given examples and learns the rules from the data. A program is said to learn when its performance at a task improves with experience.

A machine learning **model** is a function with adjustable values, called **parameters**. Training a model means finding parameter values that make the model's outputs match the examples as closely as possible. Once trained, the model can make predictions for new inputs it has never seen.

The inputs to a model are called **features**. For example, to predict the price of a house, features might include its floor area, the number of bedrooms and its location. The value the model tries to predict is called the **label** or target.

## 2. Types of learning

**Supervised learning** uses examples that come with the correct answer, or label. The model learns a mapping from features to labels. There are two main kinds of supervised task:

- **Regression** predicts a number, such as a temperature or a price.
- **Classification** predicts a category, such as whether an email is spam or not spam.

**Unsupervised learning** uses data without labels. The goal is to discover structure in the data. A common example is **clustering**, which groups similar examples together, such as grouping customers with similar buying habits. Another example is dimensionality reduction, which compresses data with many features into fewer features while keeping as much information as possible.

**Reinforcement learning** is different again. An **agent** takes actions in an **environment** and receives **rewards** or penalties. Through trial and error, it learns a strategy, called a **policy**, that maximises its total reward over time. Reinforcement learning is used, for example, to train programs to play games.

## 3. A simple model: linear regression

Linear regression is one of the simplest supervised models. With one feature $x$, it predicts the label as a straight line:

$$\hat{y} = w x + b$$

Here $w$ is the weight, which controls the slope of the line, and $b$ is the bias, which shifts the line up or down. The hat on $\hat{y}$ shows that it is a prediction rather than the true value.

To measure how wrong the model is, we use a **loss function**. A common choice for regression is the mean squared error (MSE), the average of the squared differences between predictions and true values:

$$\text{MSE} = \frac{1}{n} \sum_{i=1}^{n} (\hat{y}_i - y_i)^2$$

Squaring makes all errors positive and penalises large errors more than small ones. Training aims to find the values of $w$ and $b$ that make the loss as small as possible.

## 4. Gradient descent

Gradient descent is the standard method for minimising a loss function. The gradient tells us in which direction the loss increases fastest. By repeatedly taking small steps in the opposite direction, the parameters move towards values with lower loss.

The size of each step is controlled by the **learning rate**. If the learning rate is too small, training is very slow. If it is too large, the steps overshoot the minimum and the loss may never settle down.

The following Python code shows one step of gradient descent for linear regression with a single feature:

```python
def step(w, b, xs, ys, lr):
    n = len(xs)
    dw = sum(2 * (w * x + b - y) * x for x, y in zip(xs, ys)) / n
    db = sum(2 * (w * x + b - y) for x, y in zip(xs, ys)) / n
    return w - lr * dw, b - lr * db
```

One complete pass through the whole training set is called an **epoch**. Training usually runs for many epochs.

## 5. Classification and logistic regression

For classification, a model often outputs a probability. Logistic regression passes a linear combination of the features through the sigmoid function, which squeezes any number into the range 0 to 1:

$$\sigma(z) = \frac{1}{1 + e^{-z}}$$

If the predicted probability is above a chosen threshold, often 0.5, the example is assigned to the positive class.

## 6. Splitting the data

To know whether a model will work on new data, we must test it on examples it did not see during training. Data is therefore usually split into three parts:

- The **training set** is used to fit the model's parameters.
- The **validation set** is used to compare models and to choose settings such as the learning rate. These settings, which are chosen rather than learned, are called **hyperparameters**.
- The **test set** is used only once, at the end, to estimate how well the final model performs on unseen data.

When data is scarce, **cross-validation** can be used: the data is split into several parts, and the model is trained and validated several times, each time holding out a different part.

## 7. Overfitting and underfitting

A model that is too simple cannot capture the pattern in the data. It performs poorly on both the training data and new data. This is called **underfitting**.

A model that is too complex can memorise the training examples, including their random noise, instead of learning the general pattern. It performs very well on the training data but badly on new data. This is called **overfitting**. A large gap between training performance and validation performance is a typical sign of overfitting.

Ways to reduce overfitting include collecting more training data, using a simpler model, stopping training early when validation performance stops improving, and **regularisation**, which adds a penalty to the loss for very large parameter values.

## 8. Evaluating a classifier

**Accuracy** is the share of predictions that are correct. However, accuracy can be misleading when the classes are unbalanced. If only 1 in 100 emails is spam, a model that always predicts "not spam" is 99 per cent accurate but useless.

Two more informative measures are:

- **Precision**: of all the examples the model predicted as positive, the share that really were positive.
- **Recall**: of all the truly positive examples, the share that the model found.

There is often a trade-off: raising the decision threshold usually increases precision but lowers recall. The F1 score combines the two into a single number.

## 9. Neural networks in brief

A neural network is made of layers of simple units called neurons. Each neuron computes a weighted sum of its inputs, adds a bias and applies a non-linear **activation function**. Stacking many layers allows the network to learn complex patterns. Networks with many layers are the basis of **deep learning**. The weights of a neural network are trained with gradient descent, using an algorithm called **backpropagation** to compute the gradients efficiently.

## 10. Key points to remember

- Supervised learning uses labelled examples; unsupervised learning finds structure without labels; reinforcement learning learns from rewards.
- Regression predicts numbers; classification predicts categories.
- Gradient descent reduces the loss by stepping against the gradient; the learning rate sets the step size.
- The test set must only be used at the end, to estimate performance on unseen data.
- Overfitting means doing well on training data but badly on new data.
